# SQL signatures - compact reference (Citari)

Quick reference for anyone implementing the API on top of the stored
procedures, views, functions and triggers of the English schema, without
having to re-read the raw SQL. Source of truth for everything below -
procedures, functions, views, triggers, and every table/column name:
`database/scripts/citari.sql`.

## 1. Stored procedures

Parameter convention: all parameters are `IN` unless marked `OUTPUT`.
Parameters with a `= NULL`/default value in the signature are optional.

| # | Procedure | Parameters | Possible THROWs |
| - | --- | --- | --- |
| 1 | `sp_create_tenant` | `@business_type_id INT`, `@name NVARCHAR(200)`, `@slug NVARCHAR(100)`, `@email NVARCHAR(254)`, `@phone NVARCHAR(30) = NULL`, `@description NVARCHAR(MAX) = NULL`, `@logo_url NVARCHAR(500) = NULL`, `@public_message NVARCHAR(500) = NULL`, `@tenant_id INT OUTPUT` | 50020 (404), 50002 (400) |
| 2 | `sp_create_owner` | `@tenant_id INT`, `@first_name NVARCHAR(100)`, `@last_name_1 NVARCHAR(100)`, `@last_name_2 NVARCHAR(100) = NULL`, `@email NVARCHAR(254)`, `@password_hash NVARCHAR(512)`, `@phone NVARCHAR(30) = NULL`, `@owner_id INT OUTPUT` | 50021 (404) |
| 3 | `sp_activate_tenant` | `@tenant_id INT`, `@superadmin_id INT` | 50021 (404), 50022 (404) |
| 4 | `sp_suspend_tenant` | `@tenant_id INT`, `@superadmin_id INT` | 50021 (404), 50022 (404) |
| 5 | `sp_create_service` | `@tenant_id INT`, `@category_id INT`, `@name NVARCHAR(200)`, `@description NVARCHAR(MAX) = NULL`, `@duration_minutes INT`, `@price DECIMAL(10,2) = NULL`, `@show_price BIT = 0`, `@service_id INT OUTPUT` | 50021 (404), 50023 (404) |
| 6 | `sp_update_service` | `@service_id INT`, `@tenant_id INT`, `@category_id INT = NULL`, `@name NVARCHAR(200) = NULL`, `@description NVARCHAR(MAX) = NULL`, `@duration_minutes INT = NULL`, `@price DECIMAL(10,2) = NULL`, `@show_price BIT = NULL`, `@is_active BIT = NULL` (COALESCE pattern: NULL = no change) | 50024 (404), 50023 (404) |
| 7 | `sp_create_availability_block` | `@tenant_id INT`, `@location_id INT`, `@block_date DATE`, `@start_time DATETIME2`, `@end_time DATETIME2`, `@availability_block_id INT OUTPUT` | 50021 (404), 50025 (404), 50004 (400), 50041 (409) |
| 8 | `sp_create_customer` | `@tenant_id INT`, `@first_name NVARCHAR(100)`, `@last_name_1 NVARCHAR(100)`, `@last_name_2 NVARCHAR(100) = NULL`, `@email NVARCHAR(254)`, `@phone NVARCHAR(30)`, `@notes NVARCHAR(500) = NULL`, `@customer_id INT OUTPUT` (reuses an existing customer by `tenant_id`+`email`) | 50021 (404) |
| 9 | `sp_create_booking` | `@tenant_id INT`, `@service_id INT`, `@location_id INT`, `@availability_block_id INT`, `@customer_id INT = NULL`, `@customer_first_name NVARCHAR(100) = NULL`, `@customer_last_name_1 NVARCHAR(100) = NULL`, `@customer_last_name_2 NVARCHAR(100) = NULL`, `@customer_email NVARCHAR(254) = NULL`, `@customer_phone NVARCHAR(30) = NULL`, `@customer_notes_field NVARCHAR(500) = NULL`, `@customer_notes NVARCHAR(500) = NULL`, `@booking_id INT OUTPUT`. Transactional, uses UPDLOCK+HOLDLOCK on the availability block. Does not insert into `tracking_codes`/`audit_logs` (the tr_bookings_generate_tracking and tr_bookings_audit_insert triggers do that). | 50005 (400), 50021 (404), 50001 (400), 50024 (404), 50025 (404), 50027 (404), 50026 (404), 50040 (409) |
| 10 | `sp_confirm_booking` | `@booking_id INT`, `@tenant_id INT` | 50028 (404), 50003 (400) |
| 11 | `sp_cancel_booking` | `@booking_id INT`, `@tenant_id INT = NULL` (optional: supports the public flow by tracking code, without a tenant session). Does not release the block (trigger 7, branch a, does that). | 50028 (404), 50003 (400) |
| 12 | `sp_reschedule_booking` | `@booking_id INT`, `@tenant_id INT`, `@new_availability_block_id INT`. Same pessimistic locking as `sp_create_booking`. Does not reactivate the previous block (trigger 7, branch b, does that). | 50028 (404), 50003 (400), 50026 (404), 50042 (409) |
| 13 | `sp_complete_booking` | `@booking_id INT`, `@tenant_id INT` | 50028 (404), 50003 (400) |

Note: `sp_create_booking` can also propagate a 50021 if it delegates customer
creation to `sp_create_customer` (the branch without `@customer_id`), although
in practice the tenant has already been validated before that call.

## 2. Views

All read-only, `CREATE OR ALTER VIEW`, each referencing 2+ base tables
(requirement R6).

| View | Columns (logical type) |
| --- | --- |
| `v_booking_details` | `booking_id` (int), `tenant_id` (int), `tenant_name` (text), `tenant_slug` (text), `customer_id` (int), `customer_name` (text, concatenated), `customer_email` (text), `service_id` (int), `service_name` (text), `duration_minutes` (int), `location_id` (int), `location_name` (text), `status` (text), `start_time` (datetime), `end_time` (datetime), `customer_notes` (text, nullable), `internal_notes` (text, nullable), `tracking_code` (text, nullable, LEFT JOIN), `created_at` (datetime) |
| `v_daily_agenda` | `tenant_id` (int), `booking_date` (date), `start_time` (datetime), `end_time` (datetime), `service_name` (text), `customer_name` (text), `location_name` (text), `status` (text) |
| `v_public_services` | `service_id` (int), `tenant_id` (int), `tenant_slug` (text), `category_name` (text), `name` (text), `description` (text, nullable), `duration_minutes` (int), `price` (decimal, nullable if `show_price=0`), `show_price` (bool). Filters to active service/category/tenant only. |
| `v_tenant_dashboard` | `tenant_id` (int), `name` (text), `total_bookings` (int), `pending_bookings` (int), `confirmed_bookings` (int), `cancelled_bookings` (int), `total_customers` (int), `total_active_services` (int), `total_active_locations` (int) |
| `v_availability_status` | `block_id` (int), `tenant_id` (int), `tenant_slug` (text), `location_id` (int), `location_name` (text), `block_date` (date), `start_time` (datetime), `end_time` (datetime), `block_is_active` (bool), `is_reserved` (bool, 1 if there is a non-cancelled booking), `booking_id` (int, nullable) |
| `v_customer_booking_history` | `customer_id` (int), `tenant_id` (int), `customer_name` (text), `email` (text), `booking_id` (int), `service_name` (text), `start_time` (datetime), `status` (text), `created_at` (datetime) |
| `v_service_demand` | `service_id` (int), `tenant_id` (int), `service_name` (text), `total_bookings` (int, includes 0 via LEFT JOIN), `last_booking_at` (datetime, nullable) |

## 3. Scalar functions

| Function | Signature | Return |
| --- | --- | --- |
| `dbo.fn_generate_tracking_code` | `(@seed UNIQUEIDENTIFIER)` | `NVARCHAR(50)`: `'CITARI-'` + 6 alphanumeric characters (alphabet without 0/O/1/I) derived deterministically from `@seed`. NULL if `@seed` is NULL. Cannot call `NEWID()` internally (scalar UDF restriction); the caller generates the seed (triggers can call `NEWID()`, see `tr_bookings_generate_tracking`). |
| `dbo.fn_is_tenant_active` | `(@tenant_id INT)` | `BIT`: 1 if the tenant exists, `is_active = 1` and its status (`tenant_statuses`) is `'active'`. |
| `dbo.fn_is_block_available` | `(@block_id INT)` | `BIT`: 1 if the block exists, `is_active = 1` and no non-cancelled booking points to it. |
| `dbo.fn_total_bookings_by_tenant` | `(@tenant_id INT)` | `INT`: total rows in `bookings` for that tenant (0 if none). |
| `dbo.fn_total_bookings_by_service` | `(@service_id INT)` | `INT`: total rows in `bookings` for that service (0 if none). |
| `dbo.fn_booking_duration` | `(@booking_id INT)` | `INT`: minutes between `start_time` and `end_time` of the booking. |

## 4. Triggers and automatic side effects

All on the English schema, `CREATE OR ALTER TRIGGER`, defined in
`database/scripts/citari.sql`. The API **must not duplicate** this
logic (must not manually insert into `tracking_codes`/`audit_logs`, nor
reactivate blocks): these triggers already do it within the same
transaction as the INSERT/UPDATE on `bookings`/`tenants`/`services`.

| # | Trigger | Event | Effect |
| - | --- | --- | --- |
| 1 | `tr_bookings_generate_tracking` | AFTER INSERT `bookings` | Inserts 1 row into `tracking_codes` per booking (`tracking_code` = `dbo.fn_generate_tracking_code(NEWID())`, `expires_at` = `created_at` + 30 days, `is_active = 1`). |
| 2 | `tr_bookings_audit_insert` | AFTER INSERT `bookings` | Inserts 1 row into `audit_logs` (`action='booking_created'`, `entity_name='bookings'`, `entity_id=booking_id`, `owner_id`/`superadmin_id` NULL - the acting actor will be recorded by the API in the future). |
| 3 | `tr_bookings_audit_update` | AFTER UPDATE `bookings` | If `booking_status_id` changes: inserts 1 row into `audit_logs` (`action='booking_updated'`, `old_value`/`new_value` = status names). |
| 4 | `tr_tenants_updated_at` | AFTER UPDATE `tenants` | Keeps `updated_at = SYSUTCDATETIME()` (the API does not need to set it explicitly, though doing so does not break anything). |
| 5 | `tr_services_updated_at` | AFTER UPDATE `services` | Same as above, for `services`. |
| 6 | `tr_prevent_double_booking` | AFTER INSERT, UPDATE `bookings` | Defense in depth (safety net, not the normal path): if more than one non-cancelled booking ends up pointing to the same `availability_block_id`, does `ROLLBACK` + `THROW 50043`. The normal path (stored procedure + filtered unique index) already prevents this. |
| 7 | `tr_release_block_on_cancel` | AFTER UPDATE `bookings` | (a) On cancellation: reactivates the block (`is_active=1`) and sets `availability_block_id = NULL` on the booking. (b) On reschedule (the block changes): reactivates only the PREVIOUS block. The API must not do either of these manually. |

## 5. Global THROW codes (50001-50043)

| Code | Meaning | Suggested HTTP |
| --- | --- | --- |
| 50001 | The tenant is not active. | 400 |
| 50002 | The slug is already in use by another tenant. | 400 |
| 50003 | The current booking status does not allow the requested transition. | 400 |
| 50004 | Invalid block date range (`start_time >= end_time`). | 400 |
| 50005 | You must provide `customer_id` or the complete customer data. | 400 |
| 50020 | The business type does not exist. | 404 |
| 50021 | The tenant does not exist. | 404 |
| 50022 | The superadmin does not exist. | 404 |
| 50023 | The category does not exist or does not belong to the tenant. | 404 |
| 50024 | The service does not exist or does not belong to the tenant. | 404 |
| 50025 | The location does not exist or does not belong to the tenant. | 404 |
| 50026 | The availability block does not exist or does not belong to the tenant/location. | 404 |
| 50027 | The customer does not exist or does not belong to the tenant. | 404 |
| 50028 | The booking does not exist or does not belong to the tenant. | 404 |
| 50040 | The availability block is already taken or has an active booking. | 409 |
| 50041 | The block overlaps with an existing active block at the same location. | 409 |
| 50042 | The new availability block (reschedule) is already taken. | 409 |
| 50043 | Conflict: more than one non-cancelled booking points to the same availability block (defense in depth, `tr_prevent_double_booking` trigger). | 409 |

General range: 50001-50019 validation/business rule (400); 50020-50039 not
found / does not belong to the tenant (404); 50040-50059 conflict / resource
already taken (409).

## 6. Exact status names (catalogs)

`tenant_statuses.name` (in `tenant_status_id` order, real rows; the seed adds
`status_demo_NN` rows only to satisfy the minimum row count per table and
must not be used as a real status):

- `pending`
- `active`
- `suspended`
- `inactive`

`booking_statuses.name` (in `booking_status_id` order, real rows; the seed
adds `booking_status_demo_NN` rows for the same padding purpose):

- `pending`
- `confirmed`
- `cancelled`
- `completed`
- `rescheduled`
