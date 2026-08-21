-- ============================================================
-- full-object-audit.sql
-- Project: Citari
-- Exhaustive audit: exercises EACH ONE of the 24 programmable
-- objects (13 procedures, 6 functions, 7 views, 7 triggers) at
-- least once. Complements smoke-db.sql (which already covers the
-- lifecycle of a booking in depth) by covering the objects that
-- script does not touch: tenants, owners, services, rescheduling,
-- and the views/functions that do not participate in a booking's
-- lifecycle.
--
-- Split into several batches (GO) because a single batch with this
-- many statements exceeds an internal T-SQL compiler limit. State
-- (generated IDs) is passed between batches via a session temp
-- table (#ids), which DOES persist across GO within the same
-- connection.
--
-- Re-executable: cleans up its own test data at the end.
-- ============================================================

USE citari;
GO
SET NOCOUNT ON;

PRINT '=== [full-object-audit] start ===';

CREATE TABLE #ids (key_name NVARCHAR(50) PRIMARY KEY, id_value INT NULL, dt_value DATETIME2 NULL);

-- ------------------------------------------------------------
-- 0. Cleanup from a previous failed run.
-- ------------------------------------------------------------
DECLARE @test_slug NVARCHAR(100) = N'audit-full-demo';
DECLARE @old_tenant_id INT = (SELECT tenant_id FROM tenants WHERE slug = @test_slug);

IF @old_tenant_id IS NOT NULL
BEGIN
    DELETE FROM tracking_codes WHERE booking_id IN (SELECT booking_id FROM bookings WHERE tenant_id = @old_tenant_id);
    DELETE FROM audit_logs WHERE tenant_id = @old_tenant_id;
    DELETE FROM bookings WHERE tenant_id = @old_tenant_id;
    DELETE FROM availability_blocks WHERE tenant_id = @old_tenant_id;
    DELETE FROM customer_emails WHERE customer_id IN (SELECT customer_id FROM customers WHERE tenant_id = @old_tenant_id);
    DELETE FROM customer_phones WHERE customer_id IN (SELECT customer_id FROM customers WHERE tenant_id = @old_tenant_id);
    DELETE FROM customers WHERE tenant_id = @old_tenant_id;
    DELETE FROM services WHERE tenant_id = @old_tenant_id;
    DELETE FROM service_categories WHERE tenant_id = @old_tenant_id;
    DELETE FROM business_hours WHERE tenant_id = @old_tenant_id;
    DELETE FROM location_phones WHERE location_id IN (SELECT location_id FROM locations WHERE tenant_id = @old_tenant_id);
    DELETE FROM locations WHERE tenant_id = @old_tenant_id;
    DELETE FROM owner_emails WHERE owner_id IN (SELECT owner_id FROM tenant_owners WHERE tenant_id = @old_tenant_id);
    DELETE FROM owner_phones WHERE owner_id IN (SELECT owner_id FROM tenant_owners WHERE tenant_id = @old_tenant_id);
    DELETE FROM tenant_owners WHERE tenant_id = @old_tenant_id;
    DELETE FROM tenant_emails WHERE tenant_id = @old_tenant_id;
    DELETE FROM tenant_phones WHERE tenant_id = @old_tenant_id;
    DELETE FROM addresses WHERE address_id IN (SELECT address_id FROM locations WHERE tenant_id = @old_tenant_id);
    DELETE FROM tenants WHERE tenant_id = @old_tenant_id;
END

-- ------------------------------------------------------------
-- 1/13. sp_create_tenant
-- ------------------------------------------------------------
DECLARE @tenant_id INT, @ok BIT;
DECLARE @business_type_id INT = (SELECT TOP 1 business_type_id FROM business_types ORDER BY business_type_id);
DECLARE @superadmin_id INT = (SELECT TOP 1 superadmin_id FROM superadmins ORDER BY superadmin_id);

EXEC sp_create_tenant
    @business_type_id = @business_type_id, @name = N'Audit Full Demo', @slug = @test_slug,
    @email = N'audit@demo.test', @phone = N'0000-0000', @tenant_id = @tenant_id OUTPUT;
SET @ok = CASE WHEN @tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM tenant_emails WHERE tenant_id = @tenant_id) THEN 1 ELSE 0 END;
PRINT ' [1/13] sp_create_tenant ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 2/13. sp_create_owner
-- ------------------------------------------------------------
DECLARE @owner_id INT;
EXEC sp_create_owner
    @tenant_id = @tenant_id, @first_name = N'Owner', @last_name_1 = N'Test',
    @email = N'owner.audit@demo.test', @password_hash = N'hash-demo',
    @phone = N'0000-0001', @owner_id = @owner_id OUTPUT;
SET @ok = CASE WHEN @owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM owner_emails WHERE owner_id = @owner_id) THEN 1 ELSE 0 END;
PRINT ' [2/13] sp_create_owner ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 3/13. sp_activate_tenant  (+ triggers tr_tenants_updated_at)
-- ------------------------------------------------------------
DECLARE @updated_before DATETIME2 = (SELECT updated_at FROM tenants WHERE tenant_id = @tenant_id);
WAITFOR DELAY '00:00:00.010';
EXEC sp_activate_tenant @tenant_id = @tenant_id, @superadmin_id = @superadmin_id;
DECLARE @updated_after DATETIME2 = (SELECT updated_at FROM tenants WHERE tenant_id = @tenant_id);
SET @ok = CASE
    WHEN EXISTS (SELECT 1 FROM tenants t JOIN tenant_statuses ts ON ts.tenant_status_id = t.tenant_status_id WHERE t.tenant_id = @tenant_id AND ts.name = N'active')
     AND @updated_after > @updated_before
    THEN 1 ELSE 0 END;
PRINT ' [3/13] sp_activate_tenant (+ tr_tenants_updated_at) ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 4/13. sp_suspend_tenant (reactivated afterwards to continue the test)
-- ------------------------------------------------------------
EXEC sp_suspend_tenant @tenant_id = @tenant_id, @superadmin_id = @superadmin_id;
SET @ok = CASE WHEN EXISTS (SELECT 1 FROM tenants t JOIN tenant_statuses ts ON ts.tenant_status_id = t.tenant_status_id WHERE t.tenant_id = @tenant_id AND ts.name = N'suspended') THEN 1 ELSE 0 END;
PRINT ' [4/13] sp_suspend_tenant ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;
EXEC sp_activate_tenant @tenant_id = @tenant_id, @superadmin_id = @superadmin_id;

-- ------------------------------------------------------------
-- addresses + locations + category (support, no dedicated SP)
-- ------------------------------------------------------------
DECLARE @address_id INT, @location_id INT, @category_id INT;
INSERT INTO addresses (province, canton, district, postal_code) VALUES (N'San José', N'San José', N'Audit', N'99999');
SET @address_id = SCOPE_IDENTITY();
INSERT INTO locations (tenant_id, address_id, name, is_main, is_active) VALUES (@tenant_id, @address_id, N'Audit Site', 1, 1);
SET @location_id = SCOPE_IDENTITY();
INSERT INTO service_categories (tenant_id, name, description, is_active) VALUES (@tenant_id, N'Audit Category', N'demo', 1);
SET @category_id = SCOPE_IDENTITY();

-- ------------------------------------------------------------
-- 5/13. sp_create_service  (+ 6/13. sp_update_service, triggers tr_services_updated_at)
-- ------------------------------------------------------------
DECLARE @service_id INT;
EXEC sp_create_service
    @tenant_id = @tenant_id, @category_id = @category_id, @name = N'Audit Service',
    @duration_minutes = 30, @price = 10000, @show_price = 1, @service_id = @service_id OUTPUT;
SET @ok = CASE WHEN @service_id IS NOT NULL THEN 1 ELSE 0 END;
PRINT ' [5/13] sp_create_service ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

DECLARE @service_updated_before DATETIME2 = (SELECT updated_at FROM services WHERE service_id = @service_id);
WAITFOR DELAY '00:00:00.010';
EXEC sp_update_service @service_id = @service_id, @tenant_id = @tenant_id, @price = 12000;
DECLARE @service_updated_after DATETIME2 = (SELECT updated_at FROM services WHERE service_id = @service_id);
SET @ok = CASE WHEN (SELECT price FROM services WHERE service_id = @service_id) = 12000 AND @service_updated_after > @service_updated_before THEN 1 ELSE 0 END;
PRINT ' [6/13] sp_update_service (+ tr_services_updated_at) ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 7/13. sp_create_availability_block
-- ------------------------------------------------------------
DECLARE @block_1_id INT, @block_2_id INT;
EXEC sp_create_availability_block
    @tenant_id = @tenant_id, @location_id = @location_id, @block_date = '2032-02-01',
    @start_time = '2032-02-01T09:00:00', @end_time = '2032-02-01T09:30:00', @availability_block_id = @block_1_id OUTPUT;
EXEC sp_create_availability_block
    @tenant_id = @tenant_id, @location_id = @location_id, @block_date = '2032-02-02',
    @start_time = '2032-02-02T09:00:00', @end_time = '2032-02-02T09:30:00', @availability_block_id = @block_2_id OUTPUT;
SET @ok = CASE WHEN @block_1_id IS NOT NULL AND @block_2_id IS NOT NULL THEN 1 ELSE 0 END;
PRINT ' [7/13] sp_create_availability_block ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 8/13. sp_create_customer
-- ------------------------------------------------------------
DECLARE @customer_id INT;
EXEC sp_create_customer
    @tenant_id = @tenant_id, @first_name = N'Customer', @last_name_1 = N'Audit',
    @email = N'customer.audit@demo.test', @phone = N'0000-0002', @customer_id = @customer_id OUTPUT;
SET @ok = CASE WHEN @customer_id IS NOT NULL THEN 1 ELSE 0 END;
PRINT ' [8/13] sp_create_customer ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 9/13. sp_create_booking (+ tr_bookings_generate_tracking,
-- tr_bookings_audit_insert fired automatically)
-- ------------------------------------------------------------
DECLARE @booking_id INT;
EXEC sp_create_booking
    @tenant_id = @tenant_id, @service_id = @service_id, @location_id = @location_id,
    @availability_block_id = @block_1_id, @customer_id = @customer_id,
    @customer_notes = N'full-object-audit', @booking_id = @booking_id OUTPUT;
SET @ok = CASE WHEN @booking_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM tracking_codes WHERE booking_id = @booking_id)
    AND EXISTS (SELECT 1 FROM audit_logs WHERE entity_name = N'bookings' AND entity_id = @booking_id AND action = N'booking_created')
    THEN 1 ELSE 0 END;
PRINT ' [9/13] sp_create_booking (+ tr_bookings_generate_tracking + tr_bookings_audit_insert) ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 10/13. sp_confirm_booking
-- ------------------------------------------------------------
EXEC sp_confirm_booking @booking_id = @booking_id, @tenant_id = @tenant_id;
SET @ok = CASE WHEN EXISTS (SELECT 1 FROM bookings r JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id WHERE r.booking_id = @booking_id AND bs.name = N'confirmed') THEN 1 ELSE 0 END;
PRINT ' [10/13] sp_confirm_booking ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 11/13. sp_reschedule_booking (+ tr_release_block_on_cancel branch b)
-- ------------------------------------------------------------
EXEC sp_reschedule_booking @booking_id = @booking_id, @tenant_id = @tenant_id, @new_availability_block_id = @block_2_id;
SET @ok = CASE WHEN
       (SELECT availability_block_id FROM bookings WHERE booking_id = @booking_id) = @block_2_id
   AND (SELECT is_active FROM availability_blocks WHERE availability_block_id = @block_1_id) = 1
   AND (SELECT is_active FROM availability_blocks WHERE availability_block_id = @block_2_id) = 0
   THEN 1 ELSE 0 END;
PRINT ' [11/13] sp_reschedule_booking (+ tr_release_block_on_cancel reschedule branch) ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- tr_prevent_double_booking: direct attempt to duplicate block 2.
-- ------------------------------------------------------------
DECLARE @double_rejected BIT = 0;
BEGIN TRY
    INSERT INTO bookings (tenant_id, customer_id, service_id, location_id, availability_block_id, booking_status_id, start_time, end_time)
    SELECT @tenant_id, @customer_id, @service_id, @location_id, @block_2_id,
           (SELECT booking_status_id FROM booking_statuses WHERE name = N'pending'),
           start_time, end_time
    FROM availability_blocks WHERE availability_block_id = @block_2_id;
END TRY
BEGIN CATCH
    SET @double_rejected = 1;
END CATCH
PRINT ' [trigger] tr_prevent_double_booking (unique index as first line of defense) ... ' + CASE WHEN @double_rejected = 1 THEN 'OK (rejected)' ELSE 'FAIL (inserted)' END;

-- ------------------------------------------------------------
-- 12/13. sp_cancel_booking (+ tr_release_block_on_cancel cancel branch,
-- tr_bookings_audit_update)
-- ------------------------------------------------------------
EXEC sp_cancel_booking @booking_id = @booking_id, @tenant_id = @tenant_id;
SET @ok = CASE WHEN
       EXISTS (SELECT 1 FROM bookings r JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id WHERE r.booking_id = @booking_id AND bs.name = N'cancelled')
   AND (SELECT availability_block_id FROM bookings WHERE booking_id = @booking_id) IS NULL
   AND (SELECT is_active FROM availability_blocks WHERE availability_block_id = @block_2_id) = 1
   AND EXISTS (SELECT 1 FROM audit_logs WHERE entity_name = N'bookings' AND entity_id = @booking_id AND action = N'booking_updated')
   THEN 1 ELSE 0 END;
PRINT ' [12/13] sp_cancel_booking (+ tr_release_block_on_cancel cancel branch + tr_bookings_audit_update) ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

-- Save accumulated state in #ids for the next batch.
INSERT INTO #ids (key_name, id_value) VALUES
    ('tenant_id', @tenant_id), ('owner_id', @owner_id), ('address_id', @address_id),
    ('location_id', @location_id), ('category_id', @category_id), ('service_id', @service_id),
    ('block_1_id', @block_1_id), ('block_2_id', @block_2_id), ('customer_id', @customer_id),
    ('booking_id', @booking_id);
GO

-- ============================================================
-- BATCH 2: 13/13, the 6 functions and the 7 views.
-- ============================================================
DECLARE @tenant_id INT = (SELECT id_value FROM #ids WHERE key_name = 'tenant_id');
DECLARE @service_id INT = (SELECT id_value FROM #ids WHERE key_name = 'service_id');
DECLARE @block_1_id INT = (SELECT id_value FROM #ids WHERE key_name = 'block_1_id');
DECLARE @block_2_id INT = (SELECT id_value FROM #ids WHERE key_name = 'block_2_id');
DECLARE @customer_id INT = (SELECT id_value FROM #ids WHERE key_name = 'customer_id');
DECLARE @location_id INT = (SELECT id_value FROM #ids WHERE key_name = 'location_id');
DECLARE @ok BIT;

-- ------------------------------------------------------------
-- 13/13. sp_complete_booking (on a second booking, since a
-- cancelled one cannot be completed).
-- ------------------------------------------------------------
DECLARE @booking_2_id INT;
EXEC sp_create_booking
    @tenant_id = @tenant_id, @service_id = @service_id, @location_id = @location_id,
    @availability_block_id = @block_1_id, @customer_id = @customer_id,
    @customer_notes = N'full-object-audit-2', @booking_id = @booking_2_id OUTPUT;
EXEC sp_confirm_booking @booking_id = @booking_2_id, @tenant_id = @tenant_id;
EXEC sp_complete_booking @booking_id = @booking_2_id, @tenant_id = @tenant_id;
SET @ok = CASE WHEN EXISTS (SELECT 1 FROM bookings r JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id WHERE r.booking_id = @booking_2_id AND bs.name = N'completed') THEN 1 ELSE 0 END;
PRINT ' [13/13] sp_complete_booking ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

INSERT INTO #ids (key_name, id_value) VALUES ('booking_2_id', @booking_2_id);

-- ------------------------------------------------------------
-- 6/6 functions
-- ------------------------------------------------------------
PRINT ' [1/6] fn_generate_tracking_code ... ' + CASE WHEN dbo.fn_generate_tracking_code(NEWID()) LIKE N'CITARI-%' THEN 'OK' ELSE 'FAIL' END;
PRINT ' [2/6] fn_is_tenant_active ... ' + CASE WHEN dbo.fn_is_tenant_active(@tenant_id) = 1 THEN 'OK' ELSE 'FAIL' END;
-- block_1 is legitimately occupied by the booking from case 13/13 (just
-- completed, still occupying its block); block_2 became free once the
-- first booking was cancelled in case 12/13.
PRINT ' [3/6] fn_is_block_available ... ' + CASE WHEN dbo.fn_is_block_available(@block_1_id) = 0 AND dbo.fn_is_block_available(@block_2_id) = 1 THEN 'OK' ELSE 'FAIL' END;
PRINT ' [4/6] fn_total_bookings_by_tenant ... ' + CASE WHEN dbo.fn_total_bookings_by_tenant(@tenant_id) = 2 THEN 'OK' ELSE 'FAIL' END;
PRINT ' [5/6] fn_total_bookings_by_service ... ' + CASE WHEN dbo.fn_total_bookings_by_service(@service_id) = 2 THEN 'OK' ELSE 'FAIL' END;
PRINT ' [6/6] fn_booking_duration ... ' + CASE WHEN dbo.fn_booking_duration(@booking_2_id) = 30 THEN 'OK' ELSE 'FAIL' END;

-- ------------------------------------------------------------
-- 7/7 views
-- Note: PRINT does not accept an embedded subquery in its expression
-- (not even inside a CASE); that's why each check is resolved first
-- with SET and only then printed via the variable.
-- ------------------------------------------------------------
SET @ok = CASE WHEN EXISTS (SELECT 1 FROM v_booking_details WHERE booking_id = @booking_2_id) THEN 1 ELSE 0 END;
PRINT ' [1/7] v_booking_details ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

SET @ok = CASE WHEN EXISTS (SELECT 1 FROM v_daily_agenda WHERE tenant_id = @tenant_id) THEN 1 ELSE 0 END;
PRINT ' [2/7] v_daily_agenda ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

SET @ok = CASE WHEN EXISTS (SELECT 1 FROM v_public_services WHERE service_id = @service_id) THEN 1 ELSE 0 END;
PRINT ' [3/7] v_public_services ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

SET @ok = CASE WHEN EXISTS (SELECT 1 FROM v_tenant_dashboard WHERE tenant_id = @tenant_id AND total_bookings = 2) THEN 1 ELSE 0 END;
PRINT ' [4/7] v_tenant_dashboard ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

SET @ok = CASE WHEN EXISTS (SELECT 1 FROM v_availability_status WHERE tenant_id = @tenant_id) THEN 1 ELSE 0 END;
PRINT ' [5/7] v_availability_status ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

SET @ok = CASE WHEN EXISTS (SELECT 1 FROM v_customer_booking_history WHERE customer_id = @customer_id) THEN 1 ELSE 0 END;
PRINT ' [6/7] v_customer_booking_history ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;

SET @ok = CASE WHEN EXISTS (SELECT 1 FROM v_service_demand WHERE service_id = @service_id AND total_bookings = 2) THEN 1 ELSE 0 END;
PRINT ' [7/7] v_service_demand ... ' + CASE WHEN @ok = 1 THEN 'OK' ELSE 'FAIL' END;
GO

-- ============================================================
-- BATCH 3: final cleanup, leaves the database as it was at the start.
-- ============================================================
DECLARE @tenant_id INT = (SELECT id_value FROM #ids WHERE key_name = 'tenant_id');
DECLARE @owner_id INT = (SELECT id_value FROM #ids WHERE key_name = 'owner_id');
DECLARE @address_id INT = (SELECT id_value FROM #ids WHERE key_name = 'address_id');
DECLARE @location_id INT = (SELECT id_value FROM #ids WHERE key_name = 'location_id');
DECLARE @customer_id INT = (SELECT id_value FROM #ids WHERE key_name = 'customer_id');
DECLARE @booking_id INT = (SELECT id_value FROM #ids WHERE key_name = 'booking_id');
DECLARE @booking_2_id INT = (SELECT id_value FROM #ids WHERE key_name = 'booking_2_id');

DELETE FROM tracking_codes WHERE booking_id IN (@booking_id, @booking_2_id);
DELETE FROM audit_logs WHERE tenant_id = @tenant_id;
DELETE FROM bookings WHERE tenant_id = @tenant_id;
DELETE FROM availability_blocks WHERE tenant_id = @tenant_id;
DELETE FROM customer_emails WHERE customer_id = @customer_id;
DELETE FROM customer_phones WHERE customer_id = @customer_id;
DELETE FROM customers WHERE tenant_id = @tenant_id;
DELETE FROM services WHERE tenant_id = @tenant_id;
DELETE FROM service_categories WHERE tenant_id = @tenant_id;
DELETE FROM business_hours WHERE tenant_id = @tenant_id;
DELETE FROM location_phones WHERE location_id = @location_id;
DELETE FROM locations WHERE tenant_id = @tenant_id;
DELETE FROM addresses WHERE address_id = @address_id;
DELETE FROM owner_emails WHERE owner_id = @owner_id;
DELETE FROM owner_phones WHERE owner_id = @owner_id;
DELETE FROM tenant_owners WHERE tenant_id = @tenant_id;
DELETE FROM tenant_emails WHERE tenant_id = @tenant_id;
DELETE FROM tenant_phones WHERE tenant_id = @tenant_id;
DELETE FROM tenants WHERE tenant_id = @tenant_id;

DROP TABLE #ids;

PRINT ' [full-object-audit] cleanup ... OK';
PRINT '=== [full-object-audit] end: 13/13 procedures, 6/6 functions, 7/7 views, 7/7 triggers exercised ===';
GO
