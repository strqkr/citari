-- 05-functions.sql
-- Project: Citari
-- Content: 6 utility scalar functions over the English schema.
-- Idempotent: uses CREATE OR ALTER, can be re-run without error.

USE citari;
GO

-- 1. fn_generate_tracking_code
-- Formats 'CITARI-' + 6 alphanumeric characters deterministically derived
-- from @seed. Scalar functions cannot call NEWID(); the caller must
-- generate the seed (e.g. with NEWID()) and pass it as a parameter.
-- Ambiguous characters 0/O and 1/I are excluded from the output alphabet.
CREATE OR ALTER FUNCTION dbo.fn_generate_tracking_code (@seed UNIQUEIDENTIFIER)
RETURNS NVARCHAR(50)
AS
BEGIN
    DECLARE @charset NVARCHAR(32) = N'23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    DECLARE @bytes VARBINARY(16) = CONVERT(VARBINARY(16), @seed);
    DECLARE @result NVARCHAR(6) = N'';
    DECLARE @i INT = 1;
    DECLARE @idx INT;

    IF @seed IS NULL
        RETURN NULL;

    WHILE @i <= 6
    BEGIN
        SET @idx = CAST(SUBSTRING(@bytes, @i, 1) AS TINYINT) % 32;
        SET @result = @result + SUBSTRING(@charset, @idx + 1, 1);
        SET @i = @i + 1;
    END

    RETURN N'CITARI-' + @result;
END
GO
PRINT '[05-functions] fn_generate_tracking_code ... OK';
GO

-- 2. fn_is_tenant_active
-- 1 if the tenant exists, is_active = 1 and its status (tenant_statuses) is 'activo'.
CREATE OR ALTER FUNCTION dbo.fn_is_tenant_active (@tenant_id INT)
RETURNS BIT
AS
BEGIN
    DECLARE @result BIT = 0;

    IF EXISTS (
        SELECT 1
        FROM tenants d
        JOIN tenant_statuses ed ON ed.tenant_status_id = d.tenant_status_id
        WHERE d.tenant_id = @tenant_id
          AND d.is_active = 1
          AND ed.name = N'active'
    )
        SET @result = 1;

    RETURN @result;
END
GO
PRINT '[05-functions] fn_is_tenant_active ... OK';
GO

-- 3. fn_is_block_available
-- 1 if the block exists, is_active = 1 and has no booking pointing to it
-- in a status other than 'cancelada'.
CREATE OR ALTER FUNCTION dbo.fn_is_block_available (@block_id INT)
RETURNS BIT
AS
BEGIN
    DECLARE @result BIT = 0;

    IF EXISTS (
        SELECT 1
        FROM availability_blocks b
        WHERE b.availability_block_id = @block_id
          AND b.is_active = 1
    )
    AND NOT EXISTS (
        SELECT 1
        FROM bookings r
        JOIN booking_statuses er ON er.booking_status_id = r.booking_status_id
        WHERE r.availability_block_id = @block_id
          AND er.name <> N'cancelled'
    )
        SET @result = 1;

    RETURN @result;
END
GO
PRINT '[05-functions] fn_is_block_available ... OK';
GO

-- 4. fn_total_bookings_by_tenant
CREATE OR ALTER FUNCTION dbo.fn_total_bookings_by_tenant (@tenant_id INT)
RETURNS INT
AS
BEGIN
    DECLARE @total INT;

    SELECT @total = COUNT(*)
    FROM bookings
    WHERE tenant_id = @tenant_id;

    RETURN ISNULL(@total, 0);
END
GO
PRINT '[05-functions] fn_total_bookings_by_tenant ... OK';
GO

-- 5. fn_total_bookings_by_service
CREATE OR ALTER FUNCTION dbo.fn_total_bookings_by_service (@service_id INT)
RETURNS INT
AS
BEGIN
    DECLARE @total INT;

    SELECT @total = COUNT(*)
    FROM bookings
    WHERE service_id = @service_id;

    RETURN ISNULL(@total, 0);
END
GO
PRINT '[05-functions] fn_total_bookings_by_service ... OK';
GO

-- 6. fn_booking_duration
-- Duration in minutes of a booking (end_time - start_time).
CREATE OR ALTER FUNCTION dbo.fn_booking_duration (@booking_id INT)
RETURNS INT
AS
BEGIN
    DECLARE @minutes INT;

    SELECT @minutes = DATEDIFF(MINUTE, start_time, end_time)
    FROM bookings
    WHERE booking_id = @booking_id;

    RETURN @minutes;
END
GO
PRINT '[05-functions] fn_booking_duration ... OK';
GO

PRINT '[05-functions] 6/6 functions created';
GO
