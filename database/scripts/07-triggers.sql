-- 07-triggers.sql
-- Project: Citari
-- Contents: 7 triggers on bookings, tenants and services
-- (English identifiers, ASCII). Idempotent: CREATE OR ALTER
-- TRIGGER, can be re-run without error.
--
-- THROW codes owned by this file (within the conflict/409 range:
-- 50040-50059):
--   50043  Conflict: more than one non-cancelled booking points to
--          the same availability block. Defense in depth: the
--          filtered unique index ux_bookings_availability_block and the
--          UPDLOCK/HOLDLOCK of sp_create_booking/
--          sp_reschedule_booking should already have prevented this;
--          this trigger only protects against direct INSERT/UPDATE
--          that bypass those procedures.
--
-- Trigger list:
--   1. tr_bookings_generate_tracking   AFTER INSERT         bookings
--   2. tr_bookings_audit_insert        AFTER INSERT         bookings
--   3. tr_bookings_audit_update        AFTER UPDATE         bookings
--   4. tr_tenants_updated_at           AFTER UPDATE         tenants
--   5. tr_services_updated_at          AFTER UPDATE         services
--   6. tr_prevent_double_booking       AFTER INSERT, UPDATE bookings
--   7. tr_release_block_on_cancel      AFTER UPDATE         bookings
--
-- Note on recursion: the citari database uses the default value of
-- RECURSIVE_TRIGGERS (OFF), which already blocks direct recursion
-- (an UPDATE inside a trigger does not re-fire that same trigger on
-- the same table). Even so, triggers 3, 6 and 7 are written with
-- explicit condition-based guards (not TRIGGER_NESTLEVEL) so the
-- behavior stays correct even if RECURSIVE_TRIGGERS were ever turned
-- on. See each trigger's comment for the detail of its guard.

USE citari;
GO

-- 1. tr_bookings_generate_tracking
-- AFTER INSERT on bookings: creates a row in tracking_codes for
-- each inserted booking (supports multi-row INSERT). The code is
-- generated with dbo.fn_generate_tracking_code(NEWID()); scalar
-- functions cannot call NEWID() but triggers can, so the seed is
-- generated here (a distinct seed per row via CROSS APPLY) and
-- passed as a parameter to the function.
CREATE OR ALTER TRIGGER tr_bookings_generate_tracking
ON bookings
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO tracking_codes (booking_id, tracking_code, expires_at, is_active)
    SELECT
        i.booking_id,
        dbo.fn_generate_tracking_code(x.seed),
        DATEADD(DAY, 30, i.created_at),
        1
    FROM inserted i
    CROSS APPLY (SELECT NEWID() AS seed) x;
END
GO
PRINT ' [07-triggers] tr_bookings_generate_tracking ... OK';
GO

-- 2. tr_bookings_audit_insert
-- AFTER INSERT on bookings: records in "audit_logs" the creation
-- of each booking. owner_id/superadmin_id stay NULL; the actor that
-- originates the action is left to whoever builds that layer later.
CREATE OR ALTER TRIGGER tr_bookings_audit_insert
ON bookings
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO audit_logs
        (tenant_id, owner_id, superadmin_id, action, entity_name, entity_id, old_value, new_value)
    SELECT
        i.tenant_id,
        NULL,
        NULL,
        N'booking_created',
        N'bookings',
        i.booking_id,
        NULL,
        N'status=' + bs.name
            + N', start_time=' + CONVERT(NVARCHAR(19), i.start_time, 120)
            + N', end_time=' + CONVERT(NVARCHAR(19), i.end_time, 120)
    FROM inserted i
    JOIN booking_statuses bs ON bs.booking_status_id = i.booking_status_id;
END
GO
PRINT ' [07-triggers] tr_bookings_audit_insert ... OK';
GO

-- 3. tr_bookings_audit_update
-- AFTER UPDATE on bookings: records in "audit_logs" only when
-- booking_status_id changes (ignores other changes, for example
-- rescheduling dates or the block release done by trigger 7).
-- Anti-recursion guard: UPDATE(booking_status_id) is FALSE when the
-- recursive UPDATE (trigger 7 setting availability_block_id = NULL)
-- does not touch that column, so this trigger does not insert
-- another audit row for that case.
CREATE OR ALTER TRIGGER tr_bookings_audit_update
ON bookings
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT UPDATE(booking_status_id)
        RETURN;

    INSERT INTO audit_logs
        (tenant_id, owner_id, superadmin_id, action, entity_name, entity_id, old_value, new_value)
    SELECT
        i.tenant_id,
        NULL,
        NULL,
        N'booking_updated',
        N'bookings',
        i.booking_id,
        bs_old.name,
        bs_new.name
    FROM inserted i
    JOIN deleted d ON d.booking_id = i.booking_id
    JOIN booking_statuses bs_old ON bs_old.booking_status_id = d.booking_status_id
    JOIN booking_statuses bs_new ON bs_new.booking_status_id = i.booking_status_id
    WHERE i.booking_status_id <> d.booking_status_id;
END
GO
PRINT ' [07-triggers] tr_bookings_audit_update ... OK';
GO

-- 4. tr_tenants_updated_at
-- AFTER UPDATE on tenants: keeps updated_at = SYSUTCDATETIME().
-- Anti-recursion guard chosen: IF UPDATE(updated_at) RETURN.
-- If the statement that fired the trigger already referenced that
-- column in its SET (for example sp_activate_tenant/
-- sp_suspend_tenant, which set it explicitly), the trigger does
-- nothing. If the external UPDATE did NOT touch updated_at, the
-- trigger sets it here; that internal UPDATE does reference the
-- column, so an eventual recursive re-run of the trigger (only
-- possible if RECURSIVE_TRIGGERS were turned on) would find
-- UPDATE(updated_at) = TRUE and return immediately, with no
-- infinite loop.
CREATE OR ALTER TRIGGER tr_tenants_updated_at
ON tenants
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF UPDATE(updated_at)
        RETURN;

    UPDATE t
    SET t.updated_at = SYSUTCDATETIME()
    FROM tenants t
    JOIN inserted i ON i.tenant_id = t.tenant_id;
END
GO
PRINT ' [07-triggers] tr_tenants_updated_at ... OK';
GO

-- 5. tr_services_updated_at
-- AFTER UPDATE on services: same pattern and same anti-recursion
-- guard as tr_tenants_updated_at (IF UPDATE(updated_at) RETURN).
CREATE OR ALTER TRIGGER tr_services_updated_at
ON services
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF UPDATE(updated_at)
        RETURN;

    UPDATE s
    SET s.updated_at = SYSUTCDATETIME()
    FROM services s
    JOIN inserted i ON i.service_id = s.service_id;
END
GO
PRINT ' [07-triggers] tr_services_updated_at ... OK';
GO

-- 6. tr_prevent_double_booking
-- AFTER INSERT, UPDATE on bookings: if more than one booking not in
-- 'cancelada' status points to the same availability_block_id (not NULL),
-- rolls back the transaction with ROLLBACK + THROW 50043 (409).
--
-- Defense in depth: the filtered unique index ux_bookings_availability_block
-- already physically prevents two rows in bookings from having the
-- same non-null availability_block_id (the INSERT/UPDATE statement
-- would fail before reaching this trigger), and the UPDLOCK/HOLDLOCK
-- of sp_create_booking/sp_reschedule_booking already serializes
-- concurrent access to the block. This trigger is an additional
-- safety net for direct INSERT/UPDATE on bookings that bypass those
-- stored procedures (for example, if the filtered unique index were
-- ever relaxed or mistakenly dropped in the future).
CREATE OR ALTER TRIGGER tr_prevent_double_booking
ON bookings
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT r.availability_block_id
        FROM bookings r
        JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
        WHERE r.availability_block_id IN (
            SELECT i.availability_block_id FROM inserted i WHERE i.availability_block_id IS NOT NULL
        )
        AND bs.name <> N'cancelled'
        GROUP BY r.availability_block_id
        HAVING COUNT(*) > 1
    )
    BEGIN
        ROLLBACK TRAN;
        THROW 50043, 'Conflict: more than one non-cancelled booking points to the same availability block.', 1;
    END
END
GO
PRINT ' [07-triggers] tr_prevent_double_booking ... OK';
GO

-- 7. tr_release_block_on_cancel
-- AFTER UPDATE on bookings. Two independent behaviors:
--
-- (a) Cancellation: when booking_status_id TRANSITIONS to
--     'cancelada' (previously different, now equal), reactivates the
--     booking's availability block (is_active = 1) and sets
--     bookings.availability_block_id = NULL for that booking,
--     freeing the slot from the filtered unique index. The date
--     history stays preserved in bookings.start_time/end_time
--     (denormalized exactly for this purpose).
--
-- (b) Rescheduling: when availability_block_id CHANGES between
--     deleted and inserted (both not NULL), reactivates the
--     PREVIOUS block (deleted.availability_block_id). The new block
--     was already occupied by sp_reschedule_booking.
--
-- Anti-recursion guard (condition-based, not TRIGGER_NESTLEVEL): the
-- internal UPDATE in branch (a) only changes availability_block_id
-- to NULL and does not touch booking_status_id, so in an eventual
-- recursive re-run of this same trigger (only possible if
-- RECURSIVE_TRIGGERS were turned on; it is OFF by default) branch
-- (a)'s condition (d.booking_status_id <> cancelada) would be false
-- (the status is already 'cancelada' in both images) and branch
-- (b)'s condition would also be false (inserted.availability_block_id
-- is already NULL, and (b) requires both sides to be non-null).
-- Both branches are also mutually exclusive by construction: (a)
-- requires a status change to 'cancelada'; (b) requires that the
-- status did NOT change the block to NULL but to a different
-- non-null block.
CREATE OR ALTER TRIGGER tr_release_block_on_cancel
ON bookings
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @cancelled_status_id INT =
        (SELECT booking_status_id FROM booking_statuses WHERE name = N'cancelled');

    -- (a) Cancellation: releases the block and unlinks the booking from it.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN deleted d ON d.booking_id = i.booking_id
        WHERE i.booking_status_id = @cancelled_status_id
          AND d.booking_status_id <> @cancelled_status_id
          AND d.availability_block_id IS NOT NULL
    )
    BEGIN
        UPDATE b
        SET b.is_active = 1,
            b.updated_at = SYSUTCDATETIME()
        FROM availability_blocks b
        JOIN deleted d ON d.availability_block_id = b.availability_block_id
        JOIN inserted i ON i.booking_id = d.booking_id
        WHERE i.booking_status_id = @cancelled_status_id
          AND d.booking_status_id <> @cancelled_status_id
          AND d.availability_block_id IS NOT NULL;

        UPDATE r
        SET r.availability_block_id = NULL
        FROM bookings r
        JOIN inserted i ON i.booking_id = r.booking_id
        JOIN deleted d ON d.booking_id = i.booking_id
        WHERE i.booking_status_id = @cancelled_status_id
          AND d.booking_status_id <> @cancelled_status_id
          AND d.availability_block_id IS NOT NULL;
    END

    -- (b) Rescheduling: reactivates only the PREVIOUS block.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN deleted d ON d.booking_id = i.booking_id
        WHERE d.availability_block_id IS NOT NULL
          AND i.availability_block_id IS NOT NULL
          AND d.availability_block_id <> i.availability_block_id
    )
    BEGIN
        UPDATE b
        SET b.is_active = 1,
            b.updated_at = SYSUTCDATETIME()
        FROM availability_blocks b
        JOIN deleted d ON d.availability_block_id = b.availability_block_id
        JOIN inserted i ON i.booking_id = d.booking_id
        WHERE d.availability_block_id IS NOT NULL
          AND i.availability_block_id IS NOT NULL
          AND d.availability_block_id <> i.availability_block_id;
    END
END
GO
PRINT ' [07-triggers] tr_release_block_on_cancel ... OK';
GO

PRINT ' [07-triggers] 7/7 triggers created';
GO
