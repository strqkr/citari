-- 04-procedures.sql
-- Project: Citari
-- Contents: 13 stored procedures for tenants, services,
-- availability, customers and bookings (English identifiers,
-- ASCII). Idempotent: CREATE OR ALTER PROCEDURE.
--
-- Error convention (THROW):
--   50001-50019  validation / business rule              (400)
--   50020-50039  not found / does not belong to tenant    (404)
--   50040-50059  conflict / resource already taken        (409)
--
-- Table of error codes used in this file:
--   50001  The tenant is not active.
--   50002  The slug is already in use by another tenant.
--   50003  The current booking status does not allow the transition.
--   50004  Invalid block date range (start_time >= end_time).
--   50005  You must provide customer_id or the complete customer data.
--   50020  The business type does not exist.
--   50021  The tenant does not exist.
--   50022  The superadmin does not exist.
--   50023  The category does not exist or does not belong to the tenant.
--   50024  The service does not exist or does not belong to the tenant.
--   50025  The location does not exist or does not belong to the tenant.
--   50026  The availability block does not exist or does not belong to the tenant/location.
--   50027  The customer does not exist or does not belong to the tenant.
--   50028  The booking does not exist or does not belong to the tenant.
--   50040  The availability block is already taken or has an active booking.
--   50041  The block overlaps with an existing active block at the same location.
--   50042  The new availability block (reschedule) is already taken.
--
-- Responsibility note (anti-double-effect): these procedures do NOT
-- insert into tracking_codes or audit_logs, and NEVER reactivate an
-- availability block (SET is_active = 1). Those side effects are
-- handled by the corresponding triggers.

USE citari;
GO

-- 1. sp_create_tenant
-- Creates a tenant in 'pendiente' status.
CREATE OR ALTER PROCEDURE sp_create_tenant
    @business_type_id  INT,
    @name               NVARCHAR(200),
    @slug               NVARCHAR(100),
    @email              NVARCHAR(254),
    @phone              NVARCHAR(30)   = NULL,
    @description        NVARCHAR(MAX)  = NULL,
    @logo_url           NVARCHAR(500)  = NULL,
    @public_message     NVARCHAR(500)  = NULL,
    @tenant_id          INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM business_types WHERE business_type_id = @business_type_id)
        THROW 50020, 'The specified business type does not exist.', 1;

    IF EXISTS (SELECT 1 FROM tenants WHERE slug = @slug)
        THROW 50002, 'The slug is already in use by another tenant.', 1;

    DECLARE @pending_status_id INT =
        (SELECT tenant_status_id FROM tenant_statuses WHERE name = N'pending');

    INSERT INTO tenants
        (business_type_id, tenant_status_id, name, slug, description, logo_url, public_message)
    VALUES
        (@business_type_id, @pending_status_id, @name, @slug, @description, @logo_url, @public_message);

    SET @tenant_id = SCOPE_IDENTITY();

    -- email/phone are multi-valued (normalized in their own tables):
    -- inserted separately, using the tenant_id just generated.
    INSERT INTO tenant_emails (tenant_id, email) VALUES (@tenant_id, @email);
    IF @phone IS NOT NULL
        INSERT INTO tenant_phones (tenant_id, phone) VALUES (@tenant_id, @phone);
END
GO
PRINT ' [04-procedures] sp_create_tenant ... OK';
GO

-- 2. sp_create_owner
-- Creates the owner of an existing tenant.
CREATE OR ALTER PROCEDURE sp_create_owner
    @tenant_id       INT,
    @first_name      NVARCHAR(100),
    @last_name_1     NVARCHAR(100),
    @last_name_2     NVARCHAR(100)  = NULL,
    @email           NVARCHAR(254),
    @password_hash   NVARCHAR(512),
    @phone           NVARCHAR(30)   = NULL,
    @owner_id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = @tenant_id)
        THROW 50021, 'The specified tenant does not exist.', 1;

    INSERT INTO tenant_owners
        (tenant_id, first_name, last_name_1, last_name_2, password_hash)
    VALUES
        (@tenant_id, @first_name, @last_name_1, @last_name_2, @password_hash);

    SET @owner_id = SCOPE_IDENTITY();

    -- email/phone are multi-valued (normalized in their own tables):
    -- inserted separately, using the owner_id just generated.
    INSERT INTO owner_emails (owner_id, email) VALUES (@owner_id, @email);
    IF @phone IS NOT NULL
        INSERT INTO owner_phones (owner_id, phone) VALUES (@owner_id, @phone);
END
GO
PRINT ' [04-procedures] sp_create_owner ... OK';
GO

-- 3. sp_activate_tenant
-- Changes the tenant's status to 'activo'.
CREATE OR ALTER PROCEDURE sp_activate_tenant
    @tenant_id      INT,
    @superadmin_id  INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = @tenant_id)
        THROW 50021, 'The specified tenant does not exist.', 1;

    IF NOT EXISTS (SELECT 1 FROM superadmins WHERE superadmin_id = @superadmin_id)
        THROW 50022, 'The specified superadmin does not exist.', 1;

    UPDATE tenants
    SET tenant_status_id = (SELECT tenant_status_id FROM tenant_statuses WHERE name = N'active'),
        updated_at       = SYSUTCDATETIME()
    WHERE tenant_id = @tenant_id;
END
GO
PRINT ' [04-procedures] sp_activate_tenant ... OK';
GO

-- 4. sp_suspend_tenant
-- Changes the tenant's status to 'suspendido'.
CREATE OR ALTER PROCEDURE sp_suspend_tenant
    @tenant_id      INT,
    @superadmin_id  INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = @tenant_id)
        THROW 50021, 'The specified tenant does not exist.', 1;

    IF NOT EXISTS (SELECT 1 FROM superadmins WHERE superadmin_id = @superadmin_id)
        THROW 50022, 'The specified superadmin does not exist.', 1;

    UPDATE tenants
    SET tenant_status_id = (SELECT tenant_status_id FROM tenant_statuses WHERE name = N'suspended'),
        updated_at       = SYSUTCDATETIME()
    WHERE tenant_id = @tenant_id;
END
GO
PRINT ' [04-procedures] sp_suspend_tenant ... OK';
GO

-- 5. sp_create_service
-- Creates a service; the category must belong to the same tenant.
CREATE OR ALTER PROCEDURE sp_create_service
    @tenant_id          INT,
    @category_id        INT,
    @name               NVARCHAR(200),
    @description        NVARCHAR(MAX)   = NULL,
    @duration_minutes   INT,
    @price              DECIMAL(10,2)   = NULL,
    @show_price         BIT             = 0,
    @service_id         INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = @tenant_id)
        THROW 50021, 'The specified tenant does not exist.', 1;

    IF NOT EXISTS (SELECT 1 FROM service_categories WHERE category_id = @category_id AND tenant_id = @tenant_id)
        THROW 50023, 'The category does not exist or does not belong to the tenant.', 1;

    INSERT INTO services
        (tenant_id, category_id, name, description, duration_minutes, price, show_price)
    VALUES
        (@tenant_id, @category_id, @name, @description, @duration_minutes, @price, @show_price);

    SET @service_id = SCOPE_IDENTITY();
END
GO
PRINT ' [04-procedures] sp_create_service ... OK';
GO

-- 6. sp_update_service
-- Updates fields of a service (COALESCE pattern: NULL = no change).
CREATE OR ALTER PROCEDURE sp_update_service
    @service_id         INT,
    @tenant_id          INT,
    @category_id        INT            = NULL,
    @name               NVARCHAR(200)  = NULL,
    @description        NVARCHAR(MAX)  = NULL,
    @duration_minutes   INT            = NULL,
    @price              DECIMAL(10,2)  = NULL,
    @show_price         BIT            = NULL,
    @is_active          BIT            = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM services WHERE service_id = @service_id AND tenant_id = @tenant_id)
        THROW 50024, 'The service does not exist or does not belong to the tenant.', 1;

    IF @category_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM service_categories WHERE category_id = @category_id AND tenant_id = @tenant_id)
        THROW 50023, 'The category does not exist or does not belong to the tenant.', 1;

    UPDATE services
    SET category_id      = COALESCE(@category_id, category_id),
        name              = COALESCE(@name, name),
        description       = COALESCE(@description, description),
        duration_minutes  = COALESCE(@duration_minutes, duration_minutes),
        price             = COALESCE(@price, price),
        show_price        = COALESCE(@show_price, show_price),
        is_active         = COALESCE(@is_active, is_active),
        updated_at        = SYSUTCDATETIME()
    WHERE service_id = @service_id AND tenant_id = @tenant_id;
END
GO
PRINT ' [04-procedures] sp_update_service ... OK';
GO

-- 7. sp_create_availability_block
-- Creates an availability block, validating that the location belongs
-- to the tenant and that it does not overlap active blocks at that location.
CREATE OR ALTER PROCEDURE sp_create_availability_block
    @tenant_id             INT,
    @location_id           INT,
    @block_date            DATE,
    @start_time            DATETIME2,
    @end_time              DATETIME2,
    @availability_block_id INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = @tenant_id)
        THROW 50021, 'The specified tenant does not exist.', 1;

    IF NOT EXISTS (SELECT 1 FROM locations WHERE location_id = @location_id AND tenant_id = @tenant_id)
        THROW 50025, 'The location does not exist or does not belong to the tenant.', 1;

    IF @start_time >= @end_time
        THROW 50004, 'The block start time must be earlier than the end time.', 1;

    IF EXISTS (
        SELECT 1
        FROM availability_blocks
        WHERE location_id = @location_id
          AND is_active = 1
          AND start_time < @end_time
          AND end_time   > @start_time
    )
        THROW 50041, 'The block overlaps with an existing active block at the same location.', 1;

    INSERT INTO availability_blocks
        (tenant_id, location_id, block_date, start_time, end_time)
    VALUES
        (@tenant_id, @location_id, @block_date, @start_time, @end_time);

    SET @availability_block_id = SCOPE_IDENTITY();
END
GO
PRINT ' [04-procedures] sp_create_availability_block ... OK';
GO

-- 8. sp_create_customer
-- Creates a customer, or reuses an existing one by (tenant_id, email).
CREATE OR ALTER PROCEDURE sp_create_customer
    @tenant_id     INT,
    @first_name    NVARCHAR(100),
    @last_name_1   NVARCHAR(100),
    @last_name_2   NVARCHAR(100)  = NULL,
    @email         NVARCHAR(254),
    @phone         NVARCHAR(30),
    @notes         NVARCHAR(500)  = NULL,
    @customer_id   INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = @tenant_id)
        THROW 50021, 'The specified tenant does not exist.', 1;

    -- email lives in customer_emails (normalized): customer reuse is
    -- looked up through that table rather than a column on customers.
    SELECT @customer_id = c.customer_id
    FROM customers c
    JOIN customer_emails cc ON cc.customer_id = c.customer_id
    WHERE c.tenant_id = @tenant_id AND cc.email = @email;

    IF @customer_id IS NULL
    BEGIN
        INSERT INTO customers
            (tenant_id, first_name, last_name_1, last_name_2, notes)
        VALUES
            (@tenant_id, @first_name, @last_name_1, @last_name_2, @notes);

        SET @customer_id = SCOPE_IDENTITY();

        -- email/phone are multi-valued (normalized in their own tables):
        -- inserted separately, using the customer_id just generated.
        INSERT INTO customer_emails (customer_id, email) VALUES (@customer_id, @email);
        INSERT INTO customer_phones (customer_id, phone) VALUES (@customer_id, @phone);
    END
END
GO
PRINT ' [04-procedures] sp_create_customer ... OK';
GO

-- 9. sp_create_booking
-- Critical procedure: reserves an availability block transactionally,
-- with pessimistic locking (UPDLOCK, HOLDLOCK) to prevent double
-- booking under concurrency.
-- Does not insert into tracking_codes or audit_logs (a trigger does).
CREATE OR ALTER PROCEDURE sp_create_booking
    @tenant_id                INT,
    @service_id               INT,
    @location_id              INT,
    @availability_block_id    INT,
    @customer_id              INT             = NULL,
    @customer_first_name      NVARCHAR(100)   = NULL,
    @customer_last_name_1     NVARCHAR(100)   = NULL,
    @customer_last_name_2     NVARCHAR(100)   = NULL,
    @customer_email           NVARCHAR(254)   = NULL,
    @customer_phone           NVARCHAR(30)    = NULL,
    @customer_notes_field     NVARCHAR(500)   = NULL,
    @customer_notes           NVARCHAR(500)   = NULL,
    @booking_id               INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @customer_id IS NULL
       AND (@customer_first_name IS NULL OR @customer_last_name_1 IS NULL OR @customer_email IS NULL OR @customer_phone IS NULL)
        THROW 50005, 'You must provide customer_id or the complete customer data (first_name, last_name_1, email, phone).', 1;

    BEGIN TRY
        BEGIN TRAN;

        DECLARE @tenant_status_id INT;
        SELECT @tenant_status_id = tenant_status_id FROM tenants WHERE tenant_id = @tenant_id;

        IF @tenant_status_id IS NULL
            THROW 50021, 'The specified tenant does not exist.', 1;

        IF @tenant_status_id <> (SELECT tenant_status_id FROM tenant_statuses WHERE name = N'active')
            THROW 50001, 'The tenant is not active.', 1;

        IF NOT EXISTS (SELECT 1 FROM services WHERE service_id = @service_id AND tenant_id = @tenant_id)
            THROW 50024, 'The service does not exist or does not belong to the tenant.', 1;

        IF NOT EXISTS (SELECT 1 FROM locations WHERE location_id = @location_id AND tenant_id = @tenant_id)
            THROW 50025, 'The location does not exist or does not belong to the tenant.', 1;

        IF @customer_id IS NOT NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM customers WHERE customer_id = @customer_id AND tenant_id = @tenant_id)
                THROW 50027, 'The customer does not exist or does not belong to the tenant.', 1;
        END
        ELSE
        BEGIN
            EXEC sp_create_customer
                @tenant_id    = @tenant_id,
                @first_name   = @customer_first_name,
                @last_name_1  = @customer_last_name_1,
                @last_name_2  = @customer_last_name_2,
                @email        = @customer_email,
                @phone        = @customer_phone,
                @notes        = @customer_notes_field,
                @customer_id  = @customer_id OUTPUT;
        END

        -- Pessimistic lock on the block to prevent concurrent double booking.
        DECLARE @block_is_active     BIT,
                @block_tenant_id     INT,
                @block_location_id   INT,
                @start_time          DATETIME2,
                @end_time            DATETIME2;

        SELECT @block_is_active     = is_active,
               @block_tenant_id     = tenant_id,
               @block_location_id   = location_id,
               @start_time          = start_time,
               @end_time            = end_time
        FROM availability_blocks WITH (UPDLOCK, HOLDLOCK)
        WHERE availability_block_id = @availability_block_id;

        IF @block_tenant_id IS NULL
            THROW 50026, 'The availability block does not exist.', 1;

        IF @block_tenant_id <> @tenant_id OR @block_location_id <> @location_id
            THROW 50026, 'The availability block does not belong to the specified tenant or location.', 1;

        IF @block_is_active = 0
            THROW 50040, 'The availability block is already taken.', 1;

        IF EXISTS (
            SELECT 1
            FROM bookings
            WHERE availability_block_id = @availability_block_id
              AND booking_status_id <> (SELECT booking_status_id FROM booking_statuses WHERE name = N'cancelled')
        )
            THROW 50040, 'An active booking already exists for this availability block.', 1;

        INSERT INTO bookings
            (tenant_id, customer_id, service_id, location_id, availability_block_id, booking_status_id, start_time, end_time, customer_notes)
        VALUES
            (@tenant_id, @customer_id, @service_id, @location_id, @availability_block_id,
             (SELECT booking_status_id FROM booking_statuses WHERE name = N'pending'),
             @start_time, @end_time, @customer_notes);

        SET @booking_id = SCOPE_IDENTITY();

        -- Occupies the block. Release (is_active = 1) never happens here.
        UPDATE availability_blocks
        SET is_active = 0, updated_at = SYSUTCDATETIME()
        WHERE availability_block_id = @availability_block_id;

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
            ROLLBACK TRAN;
        THROW;
    END CATCH
END
GO
PRINT ' [04-procedures] sp_create_booking ... OK';
GO

-- 10. sp_confirm_booking
-- Transitions the booking to 'confirmada'.
CREATE OR ALTER PROCEDURE sp_confirm_booking
    @booking_id  INT,
    @tenant_id   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @current_status_id INT;

    SELECT @current_status_id = booking_status_id
    FROM bookings
    WHERE booking_id = @booking_id AND tenant_id = @tenant_id;

    IF @current_status_id IS NULL
        THROW 50028, 'The booking does not exist or does not belong to the tenant.', 1;

    IF @current_status_id NOT IN (
        (SELECT booking_status_id FROM booking_statuses WHERE name = N'pending'),
        (SELECT booking_status_id FROM booking_statuses WHERE name = N'rescheduled')
    )
        THROW 50003, 'The current booking status does not allow confirming it.', 1;

    UPDATE bookings
    SET booking_status_id = (SELECT booking_status_id FROM booking_statuses WHERE name = N'confirmed'),
        updated_at        = SYSUTCDATETIME()
    WHERE booking_id = @booking_id AND tenant_id = @tenant_id;
END
GO
PRINT ' [04-procedures] sp_confirm_booking ... OK';
GO

-- 11. sp_cancel_booking
-- Transitions the booking to 'cancelada'. @tenant_id is optional to
-- support the public flow by tracking code (without a tenant session).
-- Does not release the block (a trigger does).
CREATE OR ALTER PROCEDURE sp_cancel_booking
    @booking_id  INT,
    @tenant_id   INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @current_status_id INT;

    SELECT @current_status_id = booking_status_id
    FROM bookings
    WHERE booking_id = @booking_id
      AND (@tenant_id IS NULL OR tenant_id = @tenant_id);

    IF @current_status_id IS NULL
        THROW 50028, 'The booking does not exist or does not belong to the tenant.', 1;

    IF @current_status_id IN (
        (SELECT booking_status_id FROM booking_statuses WHERE name = N'cancelled'),
        (SELECT booking_status_id FROM booking_statuses WHERE name = N'completed')
    )
        THROW 50003, 'The current booking status does not allow cancelling it.', 1;

    -- Releasing the availability block (is_active = 1) is done by a
    -- trigger; this procedure does not perform it.
    UPDATE bookings
    SET booking_status_id = (SELECT booking_status_id FROM booking_statuses WHERE name = N'cancelled'),
        updated_at        = SYSUTCDATETIME()
    WHERE booking_id = @booking_id
      AND (@tenant_id IS NULL OR tenant_id = @tenant_id);
END
GO
PRINT ' [04-procedures] sp_cancel_booking ... OK';
GO

-- 12. sp_reschedule_booking
-- Moves the booking to a new availability block, with the same
-- pessimistic locking used in sp_create_booking.
CREATE OR ALTER PROCEDURE sp_reschedule_booking
    @booking_id                 INT,
    @tenant_id                  INT,
    @new_availability_block_id  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRAN;

        DECLARE @current_status_id INT, @location_id INT;

        SELECT @current_status_id = booking_status_id, @location_id = location_id
        FROM bookings
        WHERE booking_id = @booking_id AND tenant_id = @tenant_id;

        IF @current_status_id IS NULL
            THROW 50028, 'The booking does not exist or does not belong to the tenant.', 1;

        IF @current_status_id IN (
            (SELECT booking_status_id FROM booking_statuses WHERE name = N'cancelled'),
            (SELECT booking_status_id FROM booking_statuses WHERE name = N'completed')
        )
            THROW 50003, 'The current booking status does not allow rescheduling it.', 1;

        DECLARE @block_is_active     BIT,
                @block_tenant_id     INT,
                @block_location_id   INT,
                @start_time          DATETIME2,
                @end_time            DATETIME2;

        SELECT @block_is_active     = is_active,
               @block_tenant_id     = tenant_id,
               @block_location_id   = location_id,
               @start_time          = start_time,
               @end_time            = end_time
        FROM availability_blocks WITH (UPDLOCK, HOLDLOCK)
        WHERE availability_block_id = @new_availability_block_id;

        IF @block_tenant_id IS NULL
            THROW 50026, 'The new availability block does not exist.', 1;

        IF @block_tenant_id <> @tenant_id OR @block_location_id <> @location_id
            THROW 50026, 'The new availability block does not belong to the tenant or location of the booking.', 1;

        IF @block_is_active = 0
            THROW 50042, 'The new availability block is already taken.', 1;

        IF EXISTS (
            SELECT 1
            FROM bookings
            WHERE availability_block_id = @new_availability_block_id
              AND booking_status_id <> (SELECT booking_status_id FROM booking_statuses WHERE name = N'cancelled')
        )
            THROW 50042, 'An active booking already exists for the new availability block.', 1;

        -- Releasing the PREVIOUS block (is_active = 1) is done by a
        -- trigger; this procedure does not perform it.
        UPDATE bookings
        SET availability_block_id = @new_availability_block_id,
            start_time            = @start_time,
            end_time              = @end_time,
            booking_status_id     = (SELECT booking_status_id FROM booking_statuses WHERE name = N'rescheduled'),
            updated_at            = SYSUTCDATETIME()
        WHERE booking_id = @booking_id AND tenant_id = @tenant_id;

        -- Occupies the new block. Releasing the previous block is left
        -- to the corresponding trigger (not handled here).
        UPDATE availability_blocks
        SET is_active = 0, updated_at = SYSUTCDATETIME()
        WHERE availability_block_id = @new_availability_block_id;

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
            ROLLBACK TRAN;
        THROW;
    END CATCH
END
GO
PRINT ' [04-procedures] sp_reschedule_booking ... OK';
GO

-- 13. sp_complete_booking
-- Transitions the booking to 'completada'.
CREATE OR ALTER PROCEDURE sp_complete_booking
    @booking_id  INT,
    @tenant_id   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @current_status_id INT;

    SELECT @current_status_id = booking_status_id
    FROM bookings
    WHERE booking_id = @booking_id AND tenant_id = @tenant_id;

    IF @current_status_id IS NULL
        THROW 50028, 'The booking does not exist or does not belong to the tenant.', 1;

    IF @current_status_id <> (SELECT booking_status_id FROM booking_statuses WHERE name = N'confirmed')
        THROW 50003, 'The current booking status does not allow completing it.', 1;

    UPDATE bookings
    SET booking_status_id = (SELECT booking_status_id FROM booking_statuses WHERE name = N'completed'),
        updated_at        = SYSUTCDATETIME()
    WHERE booking_id = @booking_id AND tenant_id = @tenant_id;
END
GO
PRINT ' [04-procedures] sp_complete_booking ... OK';
GO

PRINT ' [04-procedures] 13/13 procedures created';
GO
