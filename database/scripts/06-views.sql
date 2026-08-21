-- 06-views.sql
-- Project: Citari
-- Content: 7 read views over the schema.
-- Idempotent: uses CREATE OR ALTER, can be re-run without error.
-- Every view references at least 2 base tables.

USE citari;
GO

-- 1. v_booking_details
-- Full detail of each booking (7 tables).
CREATE OR ALTER VIEW dbo.v_booking_details
AS
SELECT
    r.booking_id,
    r.tenant_id,
    t.name                                             AS tenant_name,
    t.slug                                             AS tenant_slug,
    c.customer_id,
    CONCAT_WS(N' ', c.first_name, c.last_name_1, c.last_name_2) AS customer_name,
    cco.email                                          AS customer_email,
    s.service_id,
    s.name                                             AS service_name,
    s.duration_minutes,
    l.location_id,
    l.name                                             AS location_name,
    bs.name                                            AS status,
    r.start_time,
    r.end_time,
    r.customer_notes,
    r.internal_notes,
    tc.tracking_code,
    r.created_at
FROM bookings r
JOIN tenants t ON t.tenant_id = r.tenant_id
JOIN customers c ON c.customer_id = r.customer_id
JOIN services s ON s.service_id = r.service_id
JOIN locations l ON l.location_id = r.location_id
JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
LEFT JOIN tracking_codes tc ON tc.booking_id = r.booking_id
-- email lives in customer_emails (normalized, 1:N); take the first one
-- registered as the booking's contact email.
OUTER APPLY (
    SELECT TOP 1 ce.email
    FROM customer_emails ce
    WHERE ce.customer_id = c.customer_id
    ORDER BY ce.customer_email_id
) cco;
GO
PRINT '[06-views] v_booking_details ... OK';
GO

-- 2. v_daily_agenda
-- Meant to be filtered by tenant_id + date.
CREATE OR ALTER VIEW dbo.v_daily_agenda
AS
SELECT
    r.tenant_id,
    CAST(r.start_time AS DATE) AS booking_date,
    r.start_time,
    r.end_time,
    s.name                                             AS service_name,
    CONCAT_WS(N' ', c.first_name, c.last_name_1, c.last_name_2) AS customer_name,
    l.name                                             AS location_name,
    bs.name                                            AS status
FROM bookings r
JOIN customers c ON c.customer_id = r.customer_id
JOIN services s ON s.service_id = r.service_id
JOIN locations l ON l.location_id = r.location_id
JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id;
GO
PRINT '[06-views] v_daily_agenda ... OK';
GO

-- 3. v_public_services
-- Only active services, from active categories, of active tenants.
CREATE OR ALTER VIEW dbo.v_public_services
AS
SELECT
    s.service_id,
    s.tenant_id,
    t.slug                                             AS tenant_slug,
    cat.name                                            AS category_name,
    s.name,
    s.description,
    s.duration_minutes,
    CASE WHEN s.show_price = 1 THEN s.price ELSE NULL END AS price,
    s.show_price
FROM services s
JOIN service_categories cat ON cat.category_id = s.category_id
JOIN tenants t ON t.tenant_id = s.tenant_id
WHERE s.is_active = 1
  AND cat.is_active = 1
  AND t.is_active = 1;
GO
PRINT '[06-views] v_public_services ... OK';
GO

-- 4. v_tenant_dashboard
-- Aggregates per tenant (bookings, customers, services, locations).
CREATE OR ALTER VIEW dbo.v_tenant_dashboard
AS
SELECT
    t.tenant_id,
    t.name,
    ISNULL(rb.total_bookings, 0)       AS total_bookings,
    ISNULL(rb.pending_bookings, 0)     AS pending_bookings,
    ISNULL(rb.confirmed_bookings, 0)   AS confirmed_bookings,
    ISNULL(rb.cancelled_bookings, 0)   AS cancelled_bookings,
    ISNULL(cl.total_customers, 0)      AS total_customers,
    ISNULL(sv.total_active_services, 0)  AS total_active_services,
    ISNULL(lo.total_active_locations, 0) AS total_active_locations
FROM tenants t
LEFT JOIN (
    SELECT
        r.tenant_id,
        COUNT(*)                                                     AS total_bookings,
        SUM(CASE WHEN bs.name = N'pending' THEN 1 ELSE 0 END)      AS pending_bookings,
        SUM(CASE WHEN bs.name = N'confirmed' THEN 1 ELSE 0 END)     AS confirmed_bookings,
        SUM(CASE WHEN bs.name = N'cancelled' THEN 1 ELSE 0 END)      AS cancelled_bookings
    FROM bookings r
    JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
    GROUP BY r.tenant_id
) rb ON rb.tenant_id = t.tenant_id
LEFT JOIN (
    SELECT tenant_id, COUNT(*) AS total_customers
    FROM customers
    GROUP BY tenant_id
) cl ON cl.tenant_id = t.tenant_id
LEFT JOIN (
    SELECT tenant_id, COUNT(*) AS total_active_services
    FROM services
    WHERE is_active = 1
    GROUP BY tenant_id
) sv ON sv.tenant_id = t.tenant_id
LEFT JOIN (
    SELECT tenant_id, COUNT(*) AS total_active_locations
    FROM locations
    WHERE is_active = 1
    GROUP BY tenant_id
) lo ON lo.tenant_id = t.tenant_id;
GO
PRINT '[06-views] v_tenant_dashboard ... OK';
GO

-- 5. v_availability_status
-- Status of each availability block: reserved if it has a booking in a
-- status other than 'cancelada'.
CREATE OR ALTER VIEW dbo.v_availability_status
AS
SELECT
    b.availability_block_id AS block_id,
    b.tenant_id,
    t.slug                  AS tenant_slug,
    b.location_id,
    l.name                  AS location_name,
    b.block_date,
    b.start_time,
    b.end_time,
    b.is_active              AS block_is_active,
    CASE WHEN r.booking_id IS NOT NULL THEN 1 ELSE 0 END AS is_reserved,
    r.booking_id
FROM availability_blocks b
JOIN locations l ON l.location_id = b.location_id
JOIN tenants t ON t.tenant_id = b.tenant_id
LEFT JOIN bookings r
    ON r.availability_block_id = b.availability_block_id
   AND r.booking_status_id <> (
        SELECT bs2.booking_status_id
        FROM booking_statuses bs2
        WHERE bs2.name = N'cancelled'
   );
GO
PRINT '[06-views] v_availability_status ... OK';
GO

-- 6. v_customer_booking_history
CREATE OR ALTER VIEW dbo.v_customer_booking_history
AS
SELECT
    c.customer_id,
    c.tenant_id,
    CONCAT_WS(N' ', c.first_name, c.last_name_1, c.last_name_2) AS customer_name,
    cco.email,
    r.booking_id,
    s.name AS service_name,
    r.start_time,
    bs.name AS status,
    r.created_at
FROM customers c
JOIN bookings r ON r.customer_id = c.customer_id
JOIN services s ON s.service_id = r.service_id
JOIN booking_statuses bs ON bs.booking_status_id = r.booking_status_id
-- email lives in customer_emails (normalized, 1:N); take the first one
-- registered as the contact email.
OUTER APPLY (
    SELECT TOP 1 ce.email
    FROM customer_emails ce
    WHERE ce.customer_id = c.customer_id
    ORDER BY ce.customer_email_id
) cco;
GO
PRINT '[06-views] v_customer_booking_history ... OK';
GO

-- 7. v_service_demand
CREATE OR ALTER VIEW dbo.v_service_demand
AS
SELECT
    s.service_id,
    t.tenant_id,
    s.name                 AS service_name,
    COUNT(r.booking_id)    AS total_bookings,
    MAX(r.start_time)      AS last_booking_at
FROM services s
JOIN tenants t ON t.tenant_id = s.tenant_id
LEFT JOIN bookings r ON r.service_id = s.service_id
GROUP BY s.service_id, t.tenant_id, s.name;
GO
PRINT '[06-views] v_service_demand ... OK';
GO

PRINT '[06-views] 7/7 views created';
GO
