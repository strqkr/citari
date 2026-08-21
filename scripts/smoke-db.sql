-- ============================================================
-- smoke-db.sql
-- Project: Citari
-- Re-executable smoke test for the 13 stored procedures in
-- database/scripts/04-procedures.sql and the 7 triggers in
-- database/scripts/07-triggers.sql.
--
-- Cases:
--    1. sp_create_booking on a free block -> booking created and
--       block occupied (is_active = 0).
--    2. Trigger tr_bookings_generate_tracking -> a row exists in
--       tracking_codes with tracking_code format 'CITARI-%' for the
--       booking from case 1.
--    3. Trigger tr_bookings_audit_insert -> a row exists in
--       audit_logs with action='booking_created' for the booking
--       from case 1.
--    4. Second sp_create_booking on the SAME block -> rejected
--       with a THROW in the 50040-50059 range (block already taken).
--    5. sp_cancel_booking on the booking from case 1 -> status
--       'cancelled'.
--    6. Trigger tr_release_block_on_cancel (branch a) -> the block
--       from the booking in case 1 goes back to is_active = 1.
--    7. Trigger tr_release_block_on_cancel (branch a) -> the booking
--       from case 1 ends up with availability_block_id = NULL.
--    8. Trigger tr_bookings_audit_update -> a row exists in
--       audit_logs with action='booking_updated' for the booking
--       from case 1.
--    9. sp_confirm_booking on a new booking (different block).
--   10. sp_complete_booking on that same booking.
--   11. sp_create_customer reuses the customer by duplicate email.
--   12. Double cancellation: a THIRD booking (block C) is created and
--       cancelled, and it is verified to coexist with the booking from
--       case 1 with both having availability_block_id = NULL at the
--       same time (validates the FILTERED unique index
--       ux_bookings_availability_block: a plain UNIQUE constraint
--       would not allow this).
--
-- Note on data: the seed from 03-seed-data.sql leaves the 50
-- availability blocks with is_active = 1, but each one already has a
-- seed booking pointing to it (availability_block_id has a filtered
-- unique index in bookings), so none of the seed blocks are actually
-- free for a new booking. This script creates its own test blocks via
-- sp_create_availability_block (on dates far past any existing data,
-- to avoid overlap) and removes them at the end along with the
-- bookings, the trigger side effects (tracking_codes, audit_logs) and
-- the test customer, leaving the database exactly as it was at the
-- start.
-- ============================================================

USE citari;
GO

SET NOCOUNT ON;

PRINT ' [smoke-db] starting smoke test';

-- ------------------------------------------------------------
-- 0. Setup: clean up leftovers from a previous failed run and
--    locate an active tenant with a service, location and customer.
--    The WP4 trigger side effects (tracking_codes, audit_logs) are
--    cleaned up BEFORE deleting the test bookings because
--    tracking_codes.booking_id has an FK to bookings.
-- ------------------------------------------------------------
DECLARE @test_email NVARCHAR(254) = N'smoke.cliente@example.com';

DECLARE @previous_test_ids TABLE (booking_id INT);
INSERT INTO @previous_test_ids (booking_id)
SELECT booking_id FROM bookings WHERE customer_notes = N'smoke-db test booking';

DELETE FROM tracking_codes
WHERE booking_id IN (SELECT booking_id FROM @previous_test_ids);

DELETE FROM audit_logs
WHERE entity_name = N'bookings'
  AND entity_id IN (SELECT booking_id FROM @previous_test_ids);

DELETE FROM bookings
WHERE booking_id IN (SELECT booking_id FROM @previous_test_ids);

DELETE FROM availability_blocks
WHERE block_date IN (N'2031-01-15', N'2031-01-16', N'2031-01-17');

DECLARE @test_customer_ids TABLE (customer_id INT);
INSERT INTO @test_customer_ids (customer_id)
SELECT ce.customer_id FROM customer_emails ce WHERE ce.email = @test_email;

DELETE FROM customer_emails WHERE customer_id IN (SELECT customer_id FROM @test_customer_ids);
DELETE FROM customer_phones WHERE customer_id IN (SELECT customer_id FROM @test_customer_ids);
DELETE FROM customers WHERE customer_id IN (SELECT customer_id FROM @test_customer_ids);

DECLARE @tenant_id      INT;
DECLARE @service_id     INT;
DECLARE @location_id    INT;
DECLARE @customer_id    INT;

SELECT TOP 1 @tenant_id = t.tenant_id
FROM tenants t
WHERE t.tenant_status_id = (SELECT tenant_status_id FROM tenant_statuses WHERE name = N'active')
  AND EXISTS (SELECT 1 FROM services s WHERE s.tenant_id = t.tenant_id AND s.is_active = 1)
  AND EXISTS (SELECT 1 FROM locations l WHERE l.tenant_id = t.tenant_id AND l.is_active = 1)
  AND EXISTS (SELECT 1 FROM customers c WHERE c.tenant_id = t.tenant_id)
ORDER BY t.tenant_id;

IF @tenant_id IS NULL
BEGIN
    PRINT ' [smoke-db] setup ... FAIL (no active tenant found with enough seed data)';
    RETURN;
END

SELECT TOP 1 @service_id = service_id FROM services WHERE tenant_id = @tenant_id AND is_active = 1 ORDER BY service_id;
SELECT TOP 1 @location_id = location_id FROM locations WHERE tenant_id = @tenant_id AND is_active = 1 ORDER BY location_id;
SELECT TOP 1 @customer_id = customer_id FROM customers WHERE tenant_id = @tenant_id ORDER BY customer_id;

PRINT ' [smoke-db] setup ... OK (tenant_id=' + CAST(@tenant_id AS NVARCHAR(20))
    + ', service_id=' + CAST(@service_id AS NVARCHAR(20))
    + ', location_id=' + CAST(@location_id AS NVARCHAR(20))
    + ', customer_id=' + CAST(@customer_id AS NVARCHAR(20)) + ')';

-- Test dates far past any seed data, to avoid rejection by overlap
-- (THROW 50041).
DECLARE @block_a_id INT;
DECLARE @block_b_id INT;
DECLARE @block_c_id INT;

EXEC sp_create_availability_block
    @tenant_id    = @tenant_id,
    @location_id  = @location_id,
    @block_date   = '2031-01-15',
    @start_time   = '2031-01-15T09:00:00',
    @end_time     = '2031-01-15T09:30:00',
    @availability_block_id = @block_a_id OUTPUT;

EXEC sp_create_availability_block
    @tenant_id    = @tenant_id,
    @location_id  = @location_id,
    @block_date   = '2031-01-16',
    @start_time   = '2031-01-16T10:00:00',
    @end_time     = '2031-01-16T10:30:00',
    @availability_block_id = @block_b_id OUTPUT;

EXEC sp_create_availability_block
    @tenant_id    = @tenant_id,
    @location_id  = @location_id,
    @block_date   = '2031-01-17',
    @start_time   = '2031-01-17T11:00:00',
    @end_time     = '2031-01-17T11:30:00',
    @availability_block_id = @block_c_id OUTPUT;

-- ------------------------------------------------------------
-- Case 1: create a booking on a free block.
-- ------------------------------------------------------------
DECLARE @booking_1_id INT;
DECLARE @case1_ok BIT = 0;

BEGIN TRY
    EXEC sp_create_booking
        @tenant_id               = @tenant_id,
        @service_id              = @service_id,
        @location_id             = @location_id,
        @availability_block_id   = @block_a_id,
        @customer_id             = @customer_id,
        @customer_notes          = N'smoke-db test booking',
        @booking_id              = @booking_1_id OUTPUT;

    IF @booking_1_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM bookings WHERE booking_id = @booking_1_id AND availability_block_id = @block_a_id)
       AND EXISTS (SELECT 1 FROM availability_blocks WHERE availability_block_id = @block_a_id AND is_active = 0)
        SET @case1_ok = 1;
END TRY
BEGIN CATCH
    SET @case1_ok = 0;
END CATCH

IF @case1_ok = 1
    PRINT ' [smoke-db] case 1 (create booking on a free block) ... OK';
ELSE
    PRINT ' [smoke-db] case 1 (create booking on a free block) ... FAIL';

-- ------------------------------------------------------------
-- Case 2 (WP4): trigger tr_bookings_generate_tracking generates a
-- tracking code in 'CITARI-%' format for the booking from case 1.
-- ------------------------------------------------------------
DECLARE @case2_ok BIT = 0;

IF EXISTS (
    SELECT 1 FROM tracking_codes
    WHERE booking_id = @booking_1_id
      AND tracking_code LIKE N'CITARI-%'
      AND is_active = 1
)
    SET @case2_ok = 1;

IF @case2_ok = 1
    PRINT ' [smoke-db] case 2 (trigger generates CITARI-% tracking code) ... OK';
ELSE
    PRINT ' [smoke-db] case 2 (trigger generates CITARI-% tracking code) ... FAIL';

-- ------------------------------------------------------------
-- Case 3 (WP4): trigger tr_bookings_audit_insert records the
-- creation of the booking from case 1 in "audit_logs".
-- ------------------------------------------------------------
DECLARE @case3_ok BIT = 0;

IF EXISTS (
    SELECT 1 FROM audit_logs
    WHERE entity_name = N'bookings'
      AND entity_id = @booking_1_id
      AND action = N'booking_created'
)
    SET @case3_ok = 1;

IF @case3_ok = 1
    PRINT ' [smoke-db] case 3 (trigger audits booking_created) ... OK';
ELSE
    PRINT ' [smoke-db] case 3 (trigger audits booking_created) ... FAIL';

-- ------------------------------------------------------------
-- Case 4: second booking on the same block -> must be rejected.
-- ------------------------------------------------------------
DECLARE @case4_ok BIT = 0;
DECLARE @case4_error_number INT = NULL;
DECLARE @booking_4_attempt_id INT;

BEGIN TRY
    EXEC sp_create_booking
        @tenant_id               = @tenant_id,
        @service_id              = @service_id,
        @location_id             = @location_id,
        @availability_block_id   = @block_a_id,
        @customer_id             = @customer_id,
        @customer_notes          = N'smoke-db test booking',
        @booking_id              = @booking_4_attempt_id OUTPUT;
END TRY
BEGIN CATCH
    SET @case4_error_number = ERROR_NUMBER();
    IF @case4_error_number BETWEEN 50040 AND 50059
        SET @case4_ok = 1;
END CATCH

IF @case4_ok = 1
    PRINT ' [smoke-db] case 4 (double booking on same block rejected, ERROR_NUMBER=' + CAST(@case4_error_number AS NVARCHAR(20)) + ') ... OK';
ELSE
    PRINT ' [smoke-db] case 4 (double booking on same block rejected) ... FAIL';

-- ------------------------------------------------------------
-- Case 5: cancel the booking from case 1.
-- ------------------------------------------------------------
DECLARE @case5_ok BIT = 0;

BEGIN TRY
    EXEC sp_cancel_booking
        @booking_id = @booking_1_id,
        @tenant_id  = @tenant_id;

    IF EXISTS (
        SELECT 1 FROM bookings r
        JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
        WHERE r.booking_id = @booking_1_id AND bs.name = N'cancelled'
    )
        SET @case5_ok = 1;
END TRY
BEGIN CATCH
    SET @case5_ok = 0;
END CATCH

IF @case5_ok = 1
    PRINT ' [smoke-db] case 5 (cancel booking) ... OK';
ELSE
    PRINT ' [smoke-db] case 5 (cancel booking) ... FAIL';

-- ------------------------------------------------------------
-- Case 6 (WP4): trigger tr_release_block_on_cancel (branch a) frees
-- the block from the booking in case 1 (is_active = 1).
-- ------------------------------------------------------------
DECLARE @case6_ok BIT = 0;

IF EXISTS (
    SELECT 1 FROM availability_blocks
    WHERE availability_block_id = @block_a_id AND is_active = 1
)
    SET @case6_ok = 1;

IF @case6_ok = 1
    PRINT ' [smoke-db] case 6 (trigger releases block on cancel) ... OK';
ELSE
    PRINT ' [smoke-db] case 6 (trigger releases block on cancel) ... FAIL';

-- ------------------------------------------------------------
-- Case 7 (WP4): trigger tr_release_block_on_cancel (branch a) leaves
-- availability_block_id as NULL for the booking from case 1.
-- ------------------------------------------------------------
DECLARE @case7_ok BIT = 0;

IF EXISTS (
    SELECT 1 FROM bookings
    WHERE booking_id = @booking_1_id AND availability_block_id IS NULL
)
    SET @case7_ok = 1;

IF @case7_ok = 1
    PRINT ' [smoke-db] case 7 (availability_block_id ends up NULL after cancel) ... OK';
ELSE
    PRINT ' [smoke-db] case 7 (availability_block_id ends up NULL after cancel) ... FAIL';

-- ------------------------------------------------------------
-- Case 8 (WP4): trigger tr_bookings_audit_update records the status
-- change of the booking from case 1 (-> cancelled).
-- ------------------------------------------------------------
DECLARE @case8_ok BIT = 0;

IF EXISTS (
    SELECT 1 FROM audit_logs
    WHERE entity_name = N'bookings'
      AND entity_id = @booking_1_id
      AND action = N'booking_updated'
      AND new_value = N'cancelled'
)
    SET @case8_ok = 1;

IF @case8_ok = 1
    PRINT ' [smoke-db] case 8 (trigger audits booking_updated) ... OK';
ELSE
    PRINT ' [smoke-db] case 8 (trigger audits booking_updated) ... FAIL';

-- ------------------------------------------------------------
-- Cases 9 and 10: confirm and complete a new booking (block B).
-- ------------------------------------------------------------
DECLARE @booking_2_id INT;
DECLARE @case9_ok BIT = 0;
DECLARE @case10_ok BIT = 0;

BEGIN TRY
    EXEC sp_create_booking
        @tenant_id               = @tenant_id,
        @service_id              = @service_id,
        @location_id             = @location_id,
        @availability_block_id   = @block_b_id,
        @customer_id             = @customer_id,
        @customer_notes          = N'smoke-db test booking',
        @booking_id              = @booking_2_id OUTPUT;

    EXEC sp_confirm_booking
        @booking_id = @booking_2_id,
        @tenant_id  = @tenant_id;

    IF EXISTS (
        SELECT 1 FROM bookings r
        JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
        WHERE r.booking_id = @booking_2_id AND bs.name = N'confirmed'
    )
        SET @case9_ok = 1;
END TRY
BEGIN CATCH
    SET @case9_ok = 0;
END CATCH

IF @case9_ok = 1
    PRINT ' [smoke-db] case 9 (confirm booking) ... OK';
ELSE
    PRINT ' [smoke-db] case 9 (confirm booking) ... FAIL';

BEGIN TRY
    EXEC sp_complete_booking
        @booking_id = @booking_2_id,
        @tenant_id  = @tenant_id;

    IF EXISTS (
        SELECT 1 FROM bookings r
        JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
        WHERE r.booking_id = @booking_2_id AND bs.name = N'completed'
    )
        SET @case10_ok = 1;
END TRY
BEGIN CATCH
    SET @case10_ok = 0;
END CATCH

IF @case10_ok = 1
    PRINT ' [smoke-db] case 10 (complete booking) ... OK';
ELSE
    PRINT ' [smoke-db] case 10 (complete booking) ... FAIL';

-- ------------------------------------------------------------
-- Case 11: sp_create_customer reuses the customer by duplicate email.
-- ------------------------------------------------------------
DECLARE @test_customer_id_1 INT;
DECLARE @test_customer_id_2 INT;
DECLARE @case11_ok BIT = 0;

BEGIN TRY
    EXEC sp_create_customer
        @tenant_id   = @tenant_id,
        @first_name  = N'Smoke',
        @last_name_1 = N'Test',
        @email       = @test_email,
        @phone       = N'00000000',
        @customer_id = @test_customer_id_1 OUTPUT;

    EXEC sp_create_customer
        @tenant_id   = @tenant_id,
        @first_name  = N'Smoke',
        @last_name_1 = N'Test',
        @email       = @test_email,
        @phone       = N'00000000',
        @customer_id = @test_customer_id_2 OUTPUT;

    IF @test_customer_id_1 IS NOT NULL AND @test_customer_id_1 = @test_customer_id_2
        SET @case11_ok = 1;
END TRY
BEGIN CATCH
    SET @case11_ok = 0;
END CATCH

IF @case11_ok = 1
    PRINT ' [smoke-db] case 11 (sp_create_customer reuses by duplicate email) ... OK';
ELSE
    PRINT ' [smoke-db] case 11 (sp_create_customer reuses by duplicate email) ... FAIL';

-- ------------------------------------------------------------
-- Case 12 (WP4): double cancellation. A third booking (block C) is
-- created and cancelled; the booking from case 1 and this third one
-- must coexist with availability_block_id = NULL at the same time,
-- which is only possible thanks to the FILTERED unique index
-- ux_bookings_availability_block (a plain UNIQUE constraint would
-- only allow a single NULL).
-- ------------------------------------------------------------
DECLARE @booking_3_id INT;
DECLARE @case12_ok BIT = 0;

BEGIN TRY
    EXEC sp_create_booking
        @tenant_id               = @tenant_id,
        @service_id              = @service_id,
        @location_id             = @location_id,
        @availability_block_id   = @block_c_id,
        @customer_id             = @customer_id,
        @customer_notes          = N'smoke-db test booking',
        @booking_id              = @booking_3_id OUTPUT;

    EXEC sp_cancel_booking
        @booking_id = @booking_3_id,
        @tenant_id  = @tenant_id;

    IF (
        SELECT COUNT(*)
        FROM bookings
        WHERE booking_id IN (@booking_1_id, @booking_3_id)
          AND availability_block_id IS NULL
    ) = 2
        SET @case12_ok = 1;
END TRY
BEGIN CATCH
    SET @case12_ok = 0;
END CATCH

IF @case12_ok = 1
    PRINT ' [smoke-db] case 12 (two cancelled bookings coexist with FK NULL, filtered index) ... OK';
ELSE
    PRINT ' [smoke-db] case 12 (two cancelled bookings coexist with FK NULL, filtered index) ... FAIL';

-- ------------------------------------------------------------
-- Cleanup: revert all effects from this run to leave the database
-- reusable. The WP4 trigger side effects (tracking_codes,
-- audit_logs) are deleted BEFORE the test bookings (tracking_codes
-- has an FK to bookings).
-- ------------------------------------------------------------
DELETE FROM tracking_codes
WHERE booking_id IN (@booking_1_id, @booking_2_id, @booking_3_id);

DELETE FROM audit_logs
WHERE entity_name = N'bookings'
  AND entity_id IN (@booking_1_id, @booking_2_id, @booking_3_id);

DELETE FROM bookings WHERE booking_id IN (@booking_1_id, @booking_2_id, @booking_3_id);
DELETE FROM availability_blocks WHERE availability_block_id IN (@block_a_id, @block_b_id, @block_c_id);
DELETE FROM customer_emails WHERE customer_id = @test_customer_id_1;
DELETE FROM customer_phones WHERE customer_id = @test_customer_id_1;
DELETE FROM customers WHERE customer_id = @test_customer_id_1;

PRINT ' [smoke-db] cleanup ... OK (bookings, blocks, tracking codes, audit logs and test customer removed)';
PRINT ' [smoke-db] end of smoke test';
GO
