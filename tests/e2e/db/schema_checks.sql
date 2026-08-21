-- ============================================================
-- schema_checks.sql
-- E2E validation of the live schema (citari DB) against the sources of truth:
--   database/scripts/02-create-tables.sql (tables/columns, types, defaults, indexes, FKs)
--   docs/sql-signatures.md                (SPs, functions, views, triggers)
--
-- Read-only: only SELECT/PRINT and temp objects (#temp, variables) that
-- live within this session. Does not modify application tables or data.
-- Re-runnable with no side effects.
--
-- Output format per line: ' [schema-checks] NN.MMM name ... PASS/FAIL (evidence)'
--   NN  = check number (01-08)
--   MMM = sub-item within the check
--
-- How to run (db container, citari compose project):
--   docker cp tests/e2e/db/schema_checks.sql db:/tmp/schema_checks.sql
--   docker exec db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa \
--     -P "$(/usr/bin/grep '^SQLSERVER_PASSWORD' .env | cut -d= -f2)" \
--     -C -I -d citari -W -i /tmp/schema_checks.sql
-- ============================================================

SET NOCOUNT ON;

-- ------------------------------------------------------------
-- Accumulated results table (printed at the end, ordered)
-- ------------------------------------------------------------
IF OBJECT_ID('tempdb..#results') IS NOT NULL DROP TABLE #results;
CREATE TABLE #results (
    major     TINYINT      NOT NULL,
    minor     INT          NOT NULL,
    name      NVARCHAR(200) NOT NULL,
    status    VARCHAR(4)   NOT NULL, -- PASS | FAIL | INFO
    evidence  NVARCHAR(600) NULL
);

-- ============================================================
-- CHECK 1 - DRIFT: 24 tables from 02-create-tables.sql + columns (name/type/nullable)
-- ============================================================

IF OBJECT_ID('tempdb..#expected_tables') IS NOT NULL DROP TABLE #expected_tables;
CREATE TABLE #expected_tables (name sysname COLLATE DATABASE_DEFAULT PRIMARY KEY);
INSERT INTO #expected_tables (name) VALUES
('business_types'),('tenant_statuses'),('booking_statuses'),('addresses'),
('superadmins'),('superadmin_emails'),('tenants'),('tenant_emails'),
('tenant_phones'),('tenant_owners'),('owner_emails'),('owner_phones'),
('customers'),('customer_emails'),('customer_phones'),('service_categories'),
('services'),('locations'),('location_phones'),('business_hours'),
('availability_blocks'),('bookings'),('tracking_codes'),('audit_logs');

-- 1a. existence of the 24 expected tables
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 1, ROW_NUMBER() OVER (ORDER BY e.name), 'table_exists:' + e.name,
       CASE WHEN t.object_id IS NULL THEN 'FAIL' ELSE 'PASS' END,
       CASE WHEN t.object_id IS NULL THEN 'not found in sys.tables'
            ELSE 'object_id=' + CAST(t.object_id AS VARCHAR(20)) END
FROM #expected_tables e
LEFT JOIN sys.tables t ON t.name = e.name;

-- 1b. live tables not expected (positive drift)
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 1, 25, 'no_unexpected_tables',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'extras=' + CAST(COUNT(*) AS VARCHAR(10)) +
       ISNULL(' -> ' + STRING_AGG(t.name, ','), '')
FROM sys.tables t
LEFT JOIN #expected_tables e ON e.name = t.name
WHERE e.name IS NULL;

-- Expected columns (table, column, base type, nullable) per 02-create-tables.sql
IF OBJECT_ID('tempdb..#expected_columns') IS NOT NULL DROP TABLE #expected_columns;
CREATE TABLE #expected_columns (table_name sysname COLLATE DATABASE_DEFAULT NOT NULL, column_name sysname COLLATE DATABASE_DEFAULT NOT NULL, type_name sysname COLLATE DATABASE_DEFAULT NOT NULL, nullable BIT NOT NULL);
INSERT INTO #expected_columns (table_name, column_name, type_name, nullable) VALUES
('business_types','business_type_id','int',0),
('business_types','name','nvarchar',0),
('business_types','description','nvarchar',1),
('business_types','is_active','bit',0),
('tenant_statuses','tenant_status_id','int',0),
('tenant_statuses','name','nvarchar',0),
('tenant_statuses','description','nvarchar',1),
('booking_statuses','booking_status_id','int',0),
('booking_statuses','name','nvarchar',0),
('booking_statuses','description','nvarchar',1),
('addresses','address_id','int',0),
('addresses','province','nvarchar',0),
('addresses','canton','nvarchar',0),
('addresses','district','nvarchar',0),
('addresses','postal_code','nvarchar',0),
('superadmins','superadmin_id','int',0),
('superadmins','first_name','nvarchar',0),
('superadmins','last_name_1','nvarchar',0),
('superadmins','last_name_2','nvarchar',1),
('superadmins','password_hash','nvarchar',0),
('superadmins','is_active','bit',0),
('superadmins','created_at','datetime2',0),
('superadmins','updated_at','datetime2',0),
('superadmin_emails','superadmin_email_id','int',0),
('superadmin_emails','superadmin_id','int',0),
('superadmin_emails','email','nvarchar',0),
('tenants','tenant_id','int',0),
('tenants','business_type_id','int',0),
('tenants','tenant_status_id','int',0),
('tenants','name','nvarchar',0),
('tenants','slug','nvarchar',0),
('tenants','description','nvarchar',1),
('tenants','logo_url','nvarchar',1),
('tenants','public_message','nvarchar',1),
('tenants','is_active','bit',0),
('tenants','created_at','datetime2',0),
('tenants','updated_at','datetime2',0),
('tenant_emails','tenant_email_id','int',0),
('tenant_emails','tenant_id','int',0),
('tenant_emails','email','nvarchar',0),
('tenant_phones','tenant_phone_id','int',0),
('tenant_phones','tenant_id','int',0),
('tenant_phones','phone','nvarchar',0),
('tenant_owners','owner_id','int',0),
('tenant_owners','tenant_id','int',0),
('tenant_owners','first_name','nvarchar',0),
('tenant_owners','last_name_1','nvarchar',0),
('tenant_owners','last_name_2','nvarchar',1),
('tenant_owners','password_hash','nvarchar',0),
('tenant_owners','is_active','bit',0),
('tenant_owners','created_at','datetime2',0),
('tenant_owners','updated_at','datetime2',0),
('owner_emails','owner_email_id','int',0),
('owner_emails','owner_id','int',0),
('owner_emails','email','nvarchar',0),
('owner_phones','owner_phone_id','int',0),
('owner_phones','owner_id','int',0),
('owner_phones','phone','nvarchar',0),
('customers','customer_id','int',0),
('customers','tenant_id','int',0),
('customers','first_name','nvarchar',0),
('customers','last_name_1','nvarchar',0),
('customers','last_name_2','nvarchar',1),
('customers','notes','nvarchar',1),
('customers','created_at','datetime2',0),
('customers','updated_at','datetime2',0),
('customer_emails','customer_email_id','int',0),
('customer_emails','customer_id','int',0),
('customer_emails','email','nvarchar',0),
('customer_phones','customer_phone_id','int',0),
('customer_phones','customer_id','int',0),
('customer_phones','phone','nvarchar',0),
('service_categories','category_id','int',0),
('service_categories','tenant_id','int',0),
('service_categories','name','nvarchar',0),
('service_categories','description','nvarchar',1),
('service_categories','is_active','bit',0),
('service_categories','created_at','datetime2',0),
('service_categories','updated_at','datetime2',0),
('services','service_id','int',0),
('services','tenant_id','int',0),
('services','category_id','int',0),
('services','name','nvarchar',0),
('services','description','nvarchar',1),
('services','duration_minutes','int',0),
('services','price','decimal',1),
('services','show_price','bit',0),
('services','is_active','bit',0),
('services','created_at','datetime2',0),
('services','updated_at','datetime2',0),
('locations','location_id','int',0),
('locations','tenant_id','int',0),
('locations','address_id','int',0),
('locations','name','nvarchar',0),
('locations','is_main','bit',0),
('locations','is_active','bit',0),
('locations','created_at','datetime2',0),
('locations','updated_at','datetime2',0),
('location_phones','location_phone_id','int',0),
('location_phones','location_id','int',0),
('location_phones','phone','nvarchar',0),
('business_hours','business_hour_id','int',0),
('business_hours','tenant_id','int',0),
('business_hours','location_id','int',0),
('business_hours','day_of_week','tinyint',0),
('business_hours','open_time','time',1),
('business_hours','close_time','time',1),
('business_hours','is_closed','bit',0),
('business_hours','updated_at','datetime2',0),
('availability_blocks','availability_block_id','int',0),
('availability_blocks','tenant_id','int',0),
('availability_blocks','location_id','int',0),
('availability_blocks','block_date','date',0),
('availability_blocks','start_time','datetime2',0),
('availability_blocks','end_time','datetime2',0),
('availability_blocks','is_active','bit',0),
('availability_blocks','created_at','datetime2',0),
('availability_blocks','updated_at','datetime2',0),
('bookings','booking_id','int',0),
('bookings','tenant_id','int',0),
('bookings','customer_id','int',0),
('bookings','service_id','int',0),
('bookings','location_id','int',0),
('bookings','availability_block_id','int',1),
('bookings','booking_status_id','int',0),
('bookings','start_time','datetime2',0),
('bookings','end_time','datetime2',0),
('bookings','customer_notes','nvarchar',1),
('bookings','internal_notes','nvarchar',1),
('bookings','created_at','datetime2',0),
('bookings','updated_at','datetime2',0),
('tracking_codes','tracking_id','int',0),
('tracking_codes','booking_id','int',0),
('tracking_codes','tracking_code','nvarchar',0),
('tracking_codes','expires_at','datetime2',0),
('tracking_codes','is_active','bit',0),
('tracking_codes','created_at','datetime2',0),
('audit_logs','audit_id','bigint',0),
('audit_logs','tenant_id','int',1),
('audit_logs','owner_id','int',1),
('audit_logs','superadmin_id','int',1),
('audit_logs','action','nvarchar',0),
('audit_logs','entity_name','nvarchar',0),
('audit_logs','entity_id','int',0),
('audit_logs','old_value','nvarchar',1),
('audit_logs','new_value','nvarchar',1),
('audit_logs','created_at','datetime2',0);

IF OBJECT_ID('tempdb..#column_diffs') IS NOT NULL DROP TABLE #column_diffs;
CREATE TABLE #column_diffs (table_name sysname COLLATE DATABASE_DEFAULT, column_name sysname COLLATE DATABASE_DEFAULT, reason NVARCHAR(200));

-- expected columns with no exact match (name/type/nullable) in the live DB
INSERT INTO #column_diffs (table_name, column_name, reason)
SELECT ce.table_name, ce.column_name, 'expected with no exact match (name/type/nullable) in live DB'
FROM #expected_columns ce
WHERE NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.columns c ON c.object_id = t.object_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE t.name = ce.table_name AND c.name = ce.column_name AND ty.name = ce.type_name AND c.is_nullable = ce.nullable
);

-- live columns not declared in 02-create-tables.sql (only on expected tables)
INSERT INTO #column_diffs (table_name, column_name, reason)
SELECT t.name, c.name, 'live column not declared in 02-create-tables.sql'
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
WHERE t.name IN (SELECT name FROM #expected_tables)
  AND NOT EXISTS (SELECT 1 FROM #expected_columns ce WHERE ce.table_name = t.name AND ce.column_name = c.name);

-- 1c. per-table summary (PASS if 0 differences)
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 1, 25 + ROW_NUMBER() OVER (ORDER BY tab.name), 'columns_match:' + tab.name,
       CASE WHEN ISNULL(d.n, 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN ISNULL(d.n, 0) = 0 THEN 'no differences' ELSE CAST(d.n AS VARCHAR(10)) + ' differences, see diff_detail' END
FROM #expected_tables tab
LEFT JOIN (SELECT table_name, COUNT(*) AS n FROM #column_diffs GROUP BY table_name) d ON d.table_name = tab.name;

-- 1d. diff detail (only appears if there is real drift)
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 1, 300 + ROW_NUMBER() OVER (ORDER BY table_name, column_name), 'diff_detail:' + table_name + '.' + column_name, 'INFO', reason
FROM #column_diffs;

-- ============================================================
-- CHECK 2 - Soft delete: is_active BIT DEFAULT 1; created_at/updated_at DEFAULT sysutcdatetime()
-- ============================================================

IF OBJECT_ID('tempdb..#is_active_tables') IS NOT NULL DROP TABLE #is_active_tables;
CREATE TABLE #is_active_tables (table_name sysname COLLATE DATABASE_DEFAULT);
INSERT INTO #is_active_tables (table_name) VALUES
('business_types'),('superadmins'),('tenants'),('tenant_owners'),
('service_categories'),('services'),('locations'),('availability_blocks'),
('tracking_codes');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 2, ROW_NUMBER() OVER (ORDER BY at.table_name), 'is_active_bit_default1:' + at.table_name,
       CASE WHEN c.column_id IS NULL THEN 'FAIL'
            WHEN ty.name <> 'bit' THEN 'FAIL'
            WHEN c.is_nullable = 1 THEN 'FAIL'
            WHEN dc.definition IS NULL OR dc.definition <> '((1))' THEN 'FAIL'
            ELSE 'PASS' END,
       CASE WHEN c.column_id IS NULL THEN 'is_active column does not exist'
            ELSE 'type=' + ISNULL(ty.name,'?') + ' nullable=' + CAST(c.is_nullable AS VARCHAR(1)) + ' default=' + ISNULL(dc.definition,'NULL') END
FROM #is_active_tables at
LEFT JOIN sys.tables t ON t.name = at.table_name
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'is_active'
LEFT JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = t.object_id AND dc.parent_column_id = c.column_id;

IF OBJECT_ID('tempdb..#created_at_tables') IS NOT NULL DROP TABLE #created_at_tables;
CREATE TABLE #created_at_tables (table_name sysname COLLATE DATABASE_DEFAULT);
INSERT INTO #created_at_tables (table_name) VALUES
('superadmins'),('tenants'),('tenant_owners'),('customers'),('service_categories'),
('services'),('locations'),('availability_blocks'),('bookings'),
('tracking_codes'),('audit_logs');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 2, 30 + ROW_NUMBER() OVER (ORDER BY ct.table_name), 'created_at_default_sysutcdatetime:' + ct.table_name,
       CASE WHEN c.column_id IS NULL THEN 'FAIL'
            WHEN ty.name <> 'datetime2' THEN 'FAIL'
            WHEN c.is_nullable = 1 THEN 'FAIL'
            WHEN dc.definition IS NULL OR UPPER(dc.definition) NOT LIKE '%SYSUTCDATETIME%' THEN 'FAIL'
            ELSE 'PASS' END,
       CASE WHEN c.column_id IS NULL THEN 'created_at column does not exist'
            ELSE 'type=' + ISNULL(ty.name,'?') + ' nullable=' + CAST(c.is_nullable AS VARCHAR(1)) + ' default=' + ISNULL(dc.definition,'NULL') END
FROM #created_at_tables ct
LEFT JOIN sys.tables t ON t.name = ct.table_name
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'created_at'
LEFT JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = t.object_id AND dc.parent_column_id = c.column_id;

IF OBJECT_ID('tempdb..#updated_at_tables') IS NOT NULL DROP TABLE #updated_at_tables;
CREATE TABLE #updated_at_tables (table_name sysname COLLATE DATABASE_DEFAULT);
INSERT INTO #updated_at_tables (table_name) VALUES
('superadmins'),('tenants'),('tenant_owners'),('customers'),('service_categories'),
('services'),('locations'),('business_hours'),('availability_blocks'),('bookings');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 2, 60 + ROW_NUMBER() OVER (ORDER BY at2.table_name), 'updated_at_default_sysutcdatetime:' + at2.table_name,
       CASE WHEN c.column_id IS NULL THEN 'FAIL'
            WHEN ty.name <> 'datetime2' THEN 'FAIL'
            WHEN c.is_nullable = 1 THEN 'FAIL'
            WHEN dc.definition IS NULL OR UPPER(dc.definition) NOT LIKE '%SYSUTCDATETIME%' THEN 'FAIL'
            ELSE 'PASS' END,
       CASE WHEN c.column_id IS NULL THEN 'updated_at column does not exist'
            ELSE 'type=' + ISNULL(ty.name,'?') + ' nullable=' + CAST(c.is_nullable AS VARCHAR(1)) + ' default=' + ISNULL(dc.definition,'NULL') END
FROM #updated_at_tables at2
LEFT JOIN sys.tables t ON t.name = at2.table_name
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'updated_at'
LEFT JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = t.object_id AND dc.parent_column_id = c.column_id;

-- ============================================================
-- CHECK 3 - Filtered index ux_bookings_availability_block
-- ============================================================

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 3, 1, 'filtered_index_ux_bookings_availability_block',
       CASE WHEN i.is_unique = 1 AND i.has_filter = 1 AND i.filter_definition LIKE '%IS NOT NULL%' THEN 'PASS' ELSE 'FAIL' END,
       'is_unique=' + ISNULL(CAST(i.is_unique AS VARCHAR(5)),'NULL') +
       ' has_filter=' + ISNULL(CAST(i.has_filter AS VARCHAR(5)),'NULL') +
       ' filter=' + ISNULL(i.filter_definition,'NULL')
FROM (SELECT 'bookings' AS table_name) base
LEFT JOIN sys.tables t ON t.name = base.table_name
LEFT JOIN sys.indexes i ON i.object_id = t.object_id AND i.name = 'ux_bookings_availability_block';

-- ============================================================
-- CHECK 4 - Foreign keys declared in 02-create-tables.sql + orphans = 0
-- ============================================================

IF OBJECT_ID('tempdb..#expected_fks') IS NOT NULL DROP TABLE #expected_fks;
CREATE TABLE #expected_fks (
    id INT IDENTITY(1,1) PRIMARY KEY,
    child_table sysname COLLATE DATABASE_DEFAULT, child_column sysname COLLATE DATABASE_DEFAULT,
    parent_table sysname COLLATE DATABASE_DEFAULT, parent_column sysname COLLATE DATABASE_DEFAULT,
    child_nullable BIT
);
INSERT INTO #expected_fks (child_table, child_column, parent_table, parent_column, child_nullable) VALUES
('superadmin_emails','superadmin_id','superadmins','superadmin_id',0),
('tenants','business_type_id','business_types','business_type_id',0),
('tenants','tenant_status_id','tenant_statuses','tenant_status_id',0),
('tenant_emails','tenant_id','tenants','tenant_id',0),
('tenant_phones','tenant_id','tenants','tenant_id',0),
('tenant_owners','tenant_id','tenants','tenant_id',0),
('owner_emails','owner_id','tenant_owners','owner_id',0),
('owner_phones','owner_id','tenant_owners','owner_id',0),
('customers','tenant_id','tenants','tenant_id',0),
('customer_emails','customer_id','customers','customer_id',0),
('customer_phones','customer_id','customers','customer_id',0),
('service_categories','tenant_id','tenants','tenant_id',0),
('services','tenant_id','tenants','tenant_id',0),
('services','category_id','service_categories','category_id',0),
('locations','tenant_id','tenants','tenant_id',0),
('locations','address_id','addresses','address_id',0),
('location_phones','location_id','locations','location_id',0),
('business_hours','tenant_id','tenants','tenant_id',0),
('business_hours','location_id','locations','location_id',0),
('availability_blocks','tenant_id','tenants','tenant_id',0),
('availability_blocks','location_id','locations','location_id',0),
('bookings','tenant_id','tenants','tenant_id',0),
('bookings','customer_id','customers','customer_id',0),
('bookings','service_id','services','service_id',0),
('bookings','location_id','locations','location_id',0),
('bookings','availability_block_id','availability_blocks','availability_block_id',1),
('bookings','booking_status_id','booking_statuses','booking_status_id',0),
('tracking_codes','booking_id','bookings','booking_id',0),
('audit_logs','tenant_id','tenants','tenant_id',1),
('audit_logs','owner_id','tenant_owners','owner_id',1),
('audit_logs','superadmin_id','superadmins','superadmin_id',1);

-- 4a. existence of each declared FK
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 4, fe.id, 'fk_exists:' + fe.child_table + '.' + fe.child_column + '->' + fe.parent_table,
       CASE WHEN EXISTS (
           SELECT 1
           FROM sys.foreign_keys fk
           JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
           JOIN sys.tables th ON th.object_id = fk.parent_object_id
           JOIN sys.columns ch ON ch.object_id = th.object_id AND ch.column_id = fkc.parent_column_id
           JOIN sys.tables tp ON tp.object_id = fk.referenced_object_id
           JOIN sys.columns cp ON cp.object_id = tp.object_id AND cp.column_id = fkc.referenced_column_id
           WHERE th.name = fe.child_table AND ch.name = fe.child_column
             AND tp.name = fe.parent_table AND cp.name = fe.parent_column
       ) THEN 'PASS' ELSE 'FAIL' END,
       'sys.foreign_keys/sys.foreign_key_columns'
FROM #expected_fks fe;

-- 4b. total count of live FKs vs expected (31)
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 4, 80, 'fk_count_31',
       CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM #expected_fks) THEN 'PASS' ELSE 'FAIL' END,
       'live_count=' + CAST(COUNT(*) AS VARCHAR(10)) + ' expected=' + CAST((SELECT COUNT(*) FROM #expected_fks) AS VARCHAR(10))
FROM sys.foreign_keys;

-- 4c. orphans per FK (must be 0 in each) - dynamic SQL per column pair
DECLARE @id INT, @th sysname, @ch sysname, @tp sysname, @cp sysname, @nullable BIT, @sql NVARCHAR(MAX), @cnt INT;
DECLARE fk_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT id, child_table, child_column, parent_table, parent_column, child_nullable FROM #expected_fks ORDER BY id;
OPEN fk_cursor;
FETCH NEXT FROM fk_cursor INTO @id, @th, @ch, @tp, @cp, @nullable;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(QUOTENAME(@th)) IS NULL OR OBJECT_ID(QUOTENAME(@tp)) IS NULL
    BEGIN
        INSERT INTO #results (major, minor, name, status, evidence)
        VALUES (4, 100 + @id, 'fk_orphans:' + @th + '.' + @ch, 'FAIL', 'not evaluated: child/parent table missing');
    END
    ELSE
    BEGIN
        IF @nullable = 1
            SET @sql = N'SELECT @cnt_out = COUNT(*) FROM ' + QUOTENAME(@th) + N' x LEFT JOIN ' + QUOTENAME(@tp) +
                       N' p ON x.' + QUOTENAME(@ch) + N' = p.' + QUOTENAME(@cp) +
                       N' WHERE x.' + QUOTENAME(@ch) + N' IS NOT NULL AND p.' + QUOTENAME(@cp) + N' IS NULL';
        ELSE
            SET @sql = N'SELECT @cnt_out = COUNT(*) FROM ' + QUOTENAME(@th) + N' x LEFT JOIN ' + QUOTENAME(@tp) +
                       N' p ON x.' + QUOTENAME(@ch) + N' = p.' + QUOTENAME(@cp) +
                       N' WHERE p.' + QUOTENAME(@cp) + N' IS NULL';

        EXEC sp_executesql @sql, N'@cnt_out INT OUTPUT', @cnt_out = @cnt OUTPUT;

        INSERT INTO #results (major, minor, name, status, evidence)
        VALUES (4, 100 + @id, 'fk_orphans:' + @th + '.' + @ch,
                CASE WHEN @cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
                'orphans=' + CAST(@cnt AS VARCHAR(10)));
    END
    FETCH NEXT FROM fk_cursor INTO @id, @th, @ch, @tp, @cp, @nullable;
END
CLOSE fk_cursor;
DEALLOCATE fk_cursor;

-- ============================================================
-- CHECK 5 - Multi-tenant: tenant_id on operational tables
-- ============================================================

IF OBJECT_ID('tempdb..#multitenant_tables') IS NOT NULL DROP TABLE #multitenant_tables;
CREATE TABLE #multitenant_tables (table_name sysname COLLATE DATABASE_DEFAULT, expected_nullable BIT);
INSERT INTO #multitenant_tables (table_name, expected_nullable) VALUES
('tenant_owners',0),('customers',0),('service_categories',0),('services',0),
('locations',0),('business_hours',0),('availability_blocks',0),('bookings',0),
('audit_logs',1);

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 5, ROW_NUMBER() OVER (ORDER BY mt.table_name), 'tenant_id_present:' + mt.table_name,
       CASE WHEN t.object_id IS NULL THEN 'FAIL'
            WHEN c.column_id IS NULL THEN 'FAIL'
            WHEN c.is_nullable <> mt.expected_nullable THEN 'FAIL'
            ELSE 'PASS' END,
       CASE WHEN t.object_id IS NULL THEN 'table does not exist'
            WHEN c.column_id IS NULL THEN 'tenant_id column does not exist'
            ELSE 'is_nullable=' + CAST(c.is_nullable AS VARCHAR(1)) + ' expected=' + CAST(mt.expected_nullable AS VARCHAR(1)) END
FROM #multitenant_tables mt
LEFT JOIN sys.tables t ON t.name = mt.table_name
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'tenant_id';

-- documents the exception: tracking_codes inherits the tenant via booking_id -> bookings.tenant_id
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 5, 20, 'exception_tracking_codes_inherits_via_booking',
       CASE WHEN NOT EXISTS (SELECT 1 FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id WHERE t.name = 'tracking_codes' AND c.name = 'tenant_id')
             AND EXISTS (SELECT 1 FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id WHERE t.name = 'tracking_codes' AND c.name = 'booking_id')
            THEN 'PASS' ELSE 'FAIL' END,
       'tracking_codes has no tenant_id column of its own; the tenant is resolved via booking_id -> bookings.tenant_id (documented design, not a defect)';

-- ============================================================
-- CHECK 6 - Data sanity (seed 50 rows/table)
-- ============================================================

IF OBJECT_ID('tempdb..#row_counts') IS NOT NULL DROP TABLE #row_counts;
CREATE TABLE #row_counts (table_name sysname COLLATE DATABASE_DEFAULT, n INT);
INSERT INTO #row_counts (table_name, n)
SELECT 'business_types', COUNT(*) FROM business_types
UNION ALL SELECT 'tenant_statuses', COUNT(*) FROM tenant_statuses
UNION ALL SELECT 'booking_statuses', COUNT(*) FROM booking_statuses
UNION ALL SELECT 'superadmins', COUNT(*) FROM superadmins
UNION ALL SELECT 'tenants', COUNT(*) FROM tenants
UNION ALL SELECT 'tenant_owners', COUNT(*) FROM tenant_owners
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'service_categories', COUNT(*) FROM service_categories
UNION ALL SELECT 'services', COUNT(*) FROM services
UNION ALL SELECT 'locations', COUNT(*) FROM locations
UNION ALL SELECT 'business_hours', COUNT(*) FROM business_hours
UNION ALL SELECT 'availability_blocks', COUNT(*) FROM availability_blocks
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'tracking_codes', COUNT(*) FROM tracking_codes
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 6, ROW_NUMBER() OVER (ORDER BY table_name), 'row_count_min50:' + table_name,
       CASE WHEN n >= 50 THEN 'PASS' ELSE 'FAIL' END, 'n=' + CAST(n AS VARCHAR(10))
FROM #row_counts;

-- 6.20 cancelled bookings must have availability_block_id NULL
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 6, 20, 'cancelled_block_null',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'cancelled_bookings_with_block_not_null=' + CAST(COUNT(*) AS VARCHAR(10))
FROM bookings r
JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
WHERE bs.name = 'cancelled' AND r.availability_block_id IS NOT NULL;

-- 6.21 released-block pattern: a block with no active (non-cancelled) booking
-- pointing to it must be is_active=1
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 6, 21, 'released_blocks_consistent',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'free_blocks_marked_inactive=' + CAST(COUNT(*) AS VARCHAR(10))
FROM availability_blocks b
WHERE b.is_active = 0
  AND NOT EXISTS (
      SELECT 1 FROM bookings r
      JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
      WHERE r.availability_block_id = b.availability_block_id AND bs.name <> 'cancelled'
  );

-- 6.22 unique tracking codes
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 6, 22, 'tracking_codes_unique',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'duplicate_codes=' + CAST(COUNT(*) AS VARCHAR(10))
FROM (SELECT tracking_code FROM tracking_codes GROUP BY tracking_code HAVING COUNT(*) > 1) d;

-- 6.23 current tracking_code prefix/format: detects the real prefix present
-- in the data (CITARI- or MBM-)
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 6, 23, 'tracking_code_prefix_format',
       CASE WHEN COUNT(*) > 0
                 AND COUNT(*) = SUM(CASE WHEN tracking_code LIKE 'CITARI-%' OR tracking_code LIKE 'MBM-%' THEN 1 ELSE 0 END)
            THEN 'PASS' ELSE 'FAIL' END,
       'detected_prefixes=' + ISNULL((
            SELECT STRING_AGG(prefix + ':' + CAST(n AS VARCHAR(10)), ', ')
            FROM (
                SELECT LEFT(tracking_code, CHARINDEX('-', tracking_code)) AS prefix, COUNT(*) AS n
                FROM tracking_codes
                GROUP BY LEFT(tracking_code, CHARINDEX('-', tracking_code))
            ) p
       ), 'none')
FROM tracking_codes;

-- 6.24 0 non-NULL duplicates in bookings.availability_block_id
INSERT INTO #results (major, minor, name, status, evidence)
SELECT 6, 24, 'availability_block_id_no_duplicates',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'duplicate_blocks=' + CAST(COUNT(*) AS VARCHAR(10))
FROM (SELECT availability_block_id FROM bookings WHERE availability_block_id IS NOT NULL GROUP BY availability_block_id HAVING COUNT(*) > 1) d;

-- ============================================================
-- CHECK 7 - Programmable objects: 13 SPs, 6 functions, 7 views (>=2 tables each), 7 triggers
-- ============================================================

IF OBJECT_ID('tempdb..#expected_procedures') IS NOT NULL DROP TABLE #expected_procedures;
CREATE TABLE #expected_procedures (name sysname COLLATE DATABASE_DEFAULT);
INSERT INTO #expected_procedures (name) VALUES
('sp_create_tenant'),('sp_create_owner'),('sp_activate_tenant'),('sp_suspend_tenant'),
('sp_create_service'),('sp_update_service'),('sp_create_availability_block'),
('sp_create_customer'),('sp_create_booking'),('sp_confirm_booking'),
('sp_cancel_booking'),('sp_reschedule_booking'),('sp_complete_booking');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 1, 'sp_count_13', CASE WHEN COUNT(*) = 13 THEN 'PASS' ELSE 'FAIL' END, 'count=' + CAST(COUNT(*) AS VARCHAR(5))
FROM sys.procedures;

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 1 + ROW_NUMBER() OVER (ORDER BY e.name), 'sp_exists:' + e.name,
       CASE WHEN p.object_id IS NULL THEN 'FAIL' ELSE 'PASS' END,
       ISNULL('object_id=' + CAST(p.object_id AS VARCHAR(20)), 'not found')
FROM #expected_procedures e LEFT JOIN sys.procedures p ON p.name = e.name;

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 15, 'sp_no_extras',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'extras=' + CAST(COUNT(*) AS VARCHAR(5)) + ISNULL(' -> ' + STRING_AGG(p.name, ','), '')
FROM sys.procedures p LEFT JOIN #expected_procedures e ON e.name = p.name WHERE e.name IS NULL;

IF OBJECT_ID('tempdb..#expected_functions') IS NOT NULL DROP TABLE #expected_functions;
CREATE TABLE #expected_functions (name sysname COLLATE DATABASE_DEFAULT);
INSERT INTO #expected_functions (name) VALUES
('fn_generate_tracking_code'),('fn_is_tenant_active'),('fn_is_block_available'),
('fn_total_bookings_by_tenant'),('fn_total_bookings_by_service'),('fn_booking_duration');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 16, 'fn_count_6', CASE WHEN COUNT(*) = 6 THEN 'PASS' ELSE 'FAIL' END, 'count=' + CAST(COUNT(*) AS VARCHAR(5))
FROM sys.objects WHERE type IN ('FN','TF','IF');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 16 + ROW_NUMBER() OVER (ORDER BY e.name), 'fn_exists:' + e.name,
       CASE WHEN o.object_id IS NULL THEN 'FAIL' ELSE 'PASS' END,
       ISNULL('object_id=' + CAST(o.object_id AS VARCHAR(20)), 'not found')
FROM #expected_functions e LEFT JOIN sys.objects o ON o.name = e.name AND o.type IN ('FN','TF','IF');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 23, 'fn_no_extras',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'extras=' + CAST(COUNT(*) AS VARCHAR(5)) + ISNULL(' -> ' + STRING_AGG(o.name, ','), '')
FROM sys.objects o LEFT JOIN #expected_functions e ON e.name = o.name WHERE o.type IN ('FN','TF','IF') AND e.name IS NULL;

IF OBJECT_ID('tempdb..#expected_views') IS NOT NULL DROP TABLE #expected_views;
CREATE TABLE #expected_views (name sysname COLLATE DATABASE_DEFAULT);
INSERT INTO #expected_views (name) VALUES
('v_booking_details'),('v_daily_agenda'),('v_public_services'),
('v_tenant_dashboard'),('v_availability_status'),('v_customer_booking_history'),
('v_service_demand');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 24, 'vw_count_7', CASE WHEN COUNT(*) = 7 THEN 'PASS' ELSE 'FAIL' END, 'count=' + CAST(COUNT(*) AS VARCHAR(5))
FROM sys.views;

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 24 + ROW_NUMBER() OVER (ORDER BY e.name), 'vw_exists_and_2plus_tables:' + e.name,
       CASE WHEN v.object_id IS NULL THEN 'FAIL'
            WHEN ISNULL(dep.n_tables, 0) >= 2 THEN 'PASS'
            ELSE 'FAIL' END,
       CASE WHEN v.object_id IS NULL THEN 'view not found'
            ELSE 'referenced_tables=' + CAST(ISNULL(dep.n_tables, 0) AS VARCHAR(5)) END
FROM #expected_views e
LEFT JOIN sys.views v ON v.name = e.name
LEFT JOIN (
    SELECT d.referencing_id, COUNT(DISTINCT d.referenced_id) AS n_tables
    FROM sys.sql_expression_dependencies d
    JOIN sys.tables t ON t.object_id = d.referenced_id
    GROUP BY d.referencing_id
) dep ON dep.referencing_id = v.object_id;

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 32, 'vw_no_extras',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'extras=' + CAST(COUNT(*) AS VARCHAR(5)) + ISNULL(' -> ' + STRING_AGG(v.name, ','), '')
FROM sys.views v LEFT JOIN #expected_views e ON e.name = v.name WHERE e.name IS NULL;

IF OBJECT_ID('tempdb..#expected_triggers') IS NOT NULL DROP TABLE #expected_triggers;
CREATE TABLE #expected_triggers (name sysname COLLATE DATABASE_DEFAULT);
INSERT INTO #expected_triggers (name) VALUES
('tr_bookings_generate_tracking'),('tr_bookings_audit_insert'),
('tr_bookings_audit_update'),('tr_tenants_updated_at'),
('tr_services_updated_at'),('tr_prevent_double_booking'),('tr_release_block_on_cancel');

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 33, 'tr_count_7', CASE WHEN COUNT(*) = 7 THEN 'PASS' ELSE 'FAIL' END, 'count=' + CAST(COUNT(*) AS VARCHAR(5))
FROM sys.triggers;

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 33 + ROW_NUMBER() OVER (ORDER BY e.name), 'tr_exists:' + e.name,
       CASE WHEN tr.object_id IS NULL THEN 'FAIL' ELSE 'PASS' END,
       ISNULL('object_id=' + CAST(tr.object_id AS VARCHAR(20)), 'not found')
FROM #expected_triggers e LEFT JOIN sys.triggers tr ON tr.name = e.name;

INSERT INTO #results (major, minor, name, status, evidence)
SELECT 7, 41, 'tr_no_extras',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'extras=' + CAST(COUNT(*) AS VARCHAR(5)) + ISNULL(' -> ' + STRING_AGG(tr.name, ','), '')
FROM sys.triggers tr LEFT JOIN #expected_triggers e ON e.name = tr.name WHERE e.name IS NULL;

-- ============================================================
-- CHECK 8 - Design finding: tenants.slug plain UNIQUE (not filtered)
-- ============================================================

DECLARE @slug_unique_plain BIT = (
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM sys.indexes i
        JOIN sys.tables t ON t.object_id = i.object_id
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE t.name = 'tenants' AND c.name = 'slug' AND i.is_unique_constraint = 1 AND i.has_filter = 0
    ) THEN 1 ELSE 0 END
);

INSERT INTO #results (major, minor, name, status, evidence)
VALUES (8, 1, 'finding_tenants_slug_unique_not_filtered',
    CASE WHEN @slug_unique_plain = 1 THEN 'INFO' ELSE 'PASS' END,
    CASE WHEN @slug_unique_plain = 1
        THEN 'SEVERITY=MINOR: tenants.slug has a plain (non-filtered) UNIQUE constraint. A soft-deleted tenant (is_active=0) keeps occupying its slug, which blocks sp_create_tenant from recycling that same slug for a new tenant (UNIQUE violation). Bounded impact: only affects the case of re-creating a tenant with the slug of one that was deactivated; it does not affect normal read/write of active tenants. Suggested mitigation (out of scope for this check): a filtered unique index WHERE is_active = 1, similar to ux_bookings_availability_block.'
        ELSE 'not reproduced in this environment: the slug constraint is no longer a plain UNIQUE; check whether the documented finding still applies'
    END);

-- ============================================================
-- FINAL OUTPUT
-- ============================================================

SELECT
    ' [schema-checks] ' + RIGHT('0' + CAST(major AS VARCHAR(2)), 2) + '.' + RIGHT('000' + CAST(minor AS VARCHAR(4)), 3)
    + ' ' + name + ' ... ' + status
    + CASE WHEN evidence IS NOT NULL THEN ' (' + evidence + ')' ELSE '' END AS result
FROM #results
ORDER BY major, minor;

SELECT
    major AS check_num,
    COUNT(*) AS items,
    SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) AS fails,
    CASE WHEN SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) = 0 THEN 'PASS' ELSE 'FAIL' END AS check_global
FROM #results
WHERE status IN ('PASS','FAIL')
GROUP BY major
ORDER BY major;

DECLARE @total_items INT, @total_fail INT;
SELECT @total_items = COUNT(*), @total_fail = SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END)
FROM #results WHERE status IN ('PASS','FAIL');

PRINT ' [schema-checks] SUMMARY total_items=' + CAST(@total_items AS VARCHAR(10))
      + ' total_fail=' + CAST(@total_fail AS VARCHAR(10))
      + ' global_result=' + CASE WHEN @total_fail = 0 THEN 'PASS' ELSE 'FAIL' END;
