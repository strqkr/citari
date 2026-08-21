# Relational Model: Citari Booking

> Logical schema of the `citari` database. 24 tables normalized to 3NF:
> email and phone are multi-valued attributes and live in their own
> per-entity tables (superadmins, tenants, tenant owners, customers,
> locations); a location's territorial division lives in the reusable
> `addresses` catalog.
> PK = PRIMARY KEY, FK = FOREIGN KEY, UQ = UNIQUE, NN = NOT NULL

The full model is diagrammed in the drawio (`infra/citari-erd.drawio`, MR
tab). `database/scripts/02-create-tables.sql` is the source of truth for the
physical schema.

## Catalogs

### business_types
| Column | Type | Constraints |
|---|---|---|
| business_type_id | INT | **PK** IDENTITY(1,1) |
| name | NVARCHAR(100) | NN, UQ |
| description | NVARCHAR(500) | NULL |
| is_active | BIT | NN DEFAULT 1 |

### tenant_statuses
| Column | Type | Constraints |
|---|---|---|
| tenant_status_id | INT | **PK** IDENTITY(1,1) |
| name | NVARCHAR(50) | NN, UQ |
| description | NVARCHAR(200) | NULL |

### booking_statuses
| Column | Type | Constraints |
|---|---|---|
| booking_status_id | INT | **PK** IDENTITY(1,1) |
| name | NVARCHAR(50) | NN, UQ |
| description | NVARCHAR(200) | NULL |

### addresses
Reusable catalog of territorial division (province/canton/district/postal
code). Kept separate from `locations` because several locations can share
the same territorial division; the exact address (the branch's own name)
lives on the `locations` table itself.

| Column | Type | Constraints |
|---|---|---|
| address_id | INT | **PK** IDENTITY(1,1) |
| province | NVARCHAR(100) | NN |
| canton | NVARCHAR(100) | NN |
| district | NVARCHAR(100) | NN |
| postal_code | NVARCHAR(10) | NN |

---

## Superadmins

### superadmins
| Column | Type | Constraints |
|---|---|---|
| superadmin_id | INT | **PK** IDENTITY(1,1) |
| first_name | NVARCHAR(100) | NN |
| last_name_1 | NVARCHAR(100) | NN |
| last_name_2 | NVARCHAR(100) | NULL |
| password_hash | NVARCHAR(512) | NN |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### superadmin_emails
`email` is multi-valued (1NF): a superadmin can have more than one email
address.

| Column | Type | Constraints |
|---|---|---|
| superadmin_email_id | INT | **PK** IDENTITY(1,1) |
| superadmin_id | INT | **FK** → superadmins(superadmin_id), NN |
| email | NVARCHAR(254) | NN, UQ |

---

## Tenants and Owners

### tenants
| Column | Type | Constraints |
|---|---|---|
| tenant_id | INT | **PK** IDENTITY(1,1) |
| business_type_id | INT | **FK** → business_types(business_type_id), NN |
| tenant_status_id | INT | **FK** → tenant_statuses(tenant_status_id), NN |
| name | NVARCHAR(200) | NN |
| slug | NVARCHAR(100) | NN, UQ |
| description | NVARCHAR(MAX) | NULL |
| logo_url | NVARCHAR(500) | NULL |
| public_message | NVARCHAR(500) | NULL |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### tenant_emails / tenant_phones
`email` and `phone` are multi-valued (1NF): a tenant can publish more than
one contact email/phone.

| Column | Type | Constraints |
|---|---|---|
| tenant_email_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| email | NVARCHAR(254) | NN |

| Column | Type | Constraints |
|---|---|---|
| tenant_phone_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| phone | NVARCHAR(30) | NN |

### tenant_owners
| Column | Type | Constraints |
|---|---|---|
| owner_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| first_name | NVARCHAR(100) | NN |
| last_name_1 | NVARCHAR(100) | NN |
| last_name_2 | NVARCHAR(100) | NULL |
| password_hash | NVARCHAR(512) | NN |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### owner_emails / owner_phones
`email` and `phone` are multi-valued (1NF): an owner can register more
than one contact email/phone.

| Column | Type | Constraints |
|---|---|---|
| owner_email_id | INT | **PK** IDENTITY(1,1) |
| owner_id | INT | **FK** → tenant_owners(owner_id), NN |
| email | NVARCHAR(254) | NN |

| Column | Type | Constraints |
|---|---|---|
| owner_phone_id | INT | **PK** IDENTITY(1,1) |
| owner_id | INT | **FK** → tenant_owners(owner_id), NN |
| phone | NVARCHAR(30) | NN |

---

## Customers

### customers
| Column | Type | Constraints |
|---|---|---|
| customer_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| first_name | NVARCHAR(100) | NN |
| last_name_1 | NVARCHAR(100) | NN |
| last_name_2 | NVARCHAR(100) | NULL |
| notes | NVARCHAR(500) | NULL |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### customer_emails / customer_phones
`email` and `phone` are multi-valued (1NF): a customer can book with more
than one contact email/phone.

| Column | Type | Constraints |
|---|---|---|
| customer_email_id | INT | **PK** IDENTITY(1,1) |
| customer_id | INT | **FK** → customers(customer_id), NN |
| email | NVARCHAR(254) | NN |

| Column | Type | Constraints |
|---|---|---|
| customer_phone_id | INT | **PK** IDENTITY(1,1) |
| customer_id | INT | **FK** → customers(customer_id), NN |
| phone | NVARCHAR(30) | NN |

---

## Services

### service_categories
| Column | Type | Constraints |
|---|---|---|
| category_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| name | NVARCHAR(150) | NN |
| description | NVARCHAR(500) | NULL |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### services
| Column | Type | Constraints |
|---|---|---|
| service_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| category_id | INT | **FK** → service_categories(category_id), NN |
| name | NVARCHAR(200) | NN |
| description | NVARCHAR(MAX) | NULL |
| duration_minutes | INT | NN |
| price | DECIMAL(10,2) | NULL |
| show_price | BIT | NN DEFAULT 0 |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

---

## Locations and Business Hours

### locations
The detailed street address no longer lives here as free text: the
territorial division (province/canton/district/postal code) is referenced
from the `addresses` catalog.

| Column | Type | Constraints |
|---|---|---|
| location_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| address_id | INT | **FK** → addresses(address_id), NN |
| name | NVARCHAR(200) | NN |
| is_main | BIT | NN DEFAULT 0 |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### location_phones
`phone` is multi-valued (1NF): a location can publish more than one
contact phone.

| Column | Type | Constraints |
|---|---|---|
| location_phone_id | INT | **PK** IDENTITY(1,1) |
| location_id | INT | **FK** → locations(location_id), NN |
| phone | NVARCHAR(30) | NN |

### business_hours
| Column | Type | Constraints |
|---|---|---|
| business_hour_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| location_id | INT | **FK** → locations(location_id), NN |
| day_of_week | TINYINT | NN (0=Sunday .. 6=Saturday) |
| open_time | TIME | NULL |
| close_time | TIME | NULL |
| is_closed | BIT | NN DEFAULT 0 |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### availability_blocks
| Column | Type | Constraints |
|---|---|---|
| availability_block_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| location_id | INT | **FK** → locations(location_id), NN |
| block_date | DATE | NN |
| start_time | DATETIME2 | NN |
| end_time | DATETIME2 | NN |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

---

## Bookings

### bookings
| Column | Type | Constraints |
|---|---|---|
| booking_id | INT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NN |
| customer_id | INT | **FK** → customers(customer_id), NN |
| service_id | INT | **FK** → services(service_id), NN |
| location_id | INT | **FK** → locations(location_id), NN |
| availability_block_id | INT | **FK** → availability_blocks(availability_block_id), NULL, UQ, ON DELETE SET NULL |
| booking_status_id | INT | **FK** → booking_statuses(booking_status_id), NN |
| start_time | DATETIME2 | NN |
| end_time | DATETIME2 | NN |
| customer_notes | NVARCHAR(500) | NULL |
| internal_notes | NVARCHAR(500) | NULL |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |
| updated_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

### tracking_codes
| Column | Type | Constraints |
|---|---|---|
| tracking_id | INT | **PK** IDENTITY(1,1) |
| booking_id | INT | **FK** → bookings(booking_id), NN, UQ |
| tracking_code | NVARCHAR(50) | NN, UQ |
| expires_at | DATETIME2 | NN |
| is_active | BIT | NN DEFAULT 1 |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

---

## Audit

### audit_logs
| Column | Type | Constraints |
|---|---|---|
| audit_id | BIGINT | **PK** IDENTITY(1,1) |
| tenant_id | INT | **FK** → tenants(tenant_id), NULL |
| owner_id | INT | **FK** → tenant_owners(owner_id), NULL |
| superadmin_id | INT | **FK** → superadmins(superadmin_id), NULL |
| action | NVARCHAR(100) | NN |
| entity_name | NVARCHAR(100) | NN |
| entity_id | INT | NN |
| old_value | NVARCHAR(MAX) | NULL |
| new_value | NVARCHAR(MAX) | NULL |
| created_at | DATETIME2 | NN DEFAULT SYSUTCDATETIME() |

---

## Relationship Summary

| # | Parent Table | Cardinality | Child Table | Via FK |
|---|---|---|---|---|
| 1 | business_types | 1:N | tenants | business_type_id |
| 2 | tenant_statuses | 1:N | tenants | tenant_status_id |
| 3 | tenants | 1:N | tenant_owners | tenant_id |
| 4 | tenants | 1:N | customers | tenant_id |
| 5 | tenants | 1:N | service_categories | tenant_id |
| 6 | tenants | 1:N | services | tenant_id |
| 7 | tenants | 1:N | locations | tenant_id |
| 8 | tenants | 1:N | business_hours | tenant_id |
| 9 | tenants | 1:N | availability_blocks | tenant_id |
| 10 | tenants | 1:N | bookings | tenant_id |
| 11 | tenants | 1:N | audit_logs | tenant_id |
| 12 | tenant_owners | 1:N | audit_logs | owner_id |
| 13 | superadmins | 1:N | audit_logs | superadmin_id |
| 14 | service_categories | 1:N | services | category_id |
| 15 | locations | 1:N | business_hours | location_id |
| 16 | locations | 1:N | availability_blocks | location_id |
| 17 | locations | 1:N | bookings | location_id |
| 18 | availability_blocks | 1:0..1 | bookings | availability_block_id (UQ, ON DELETE SET NULL) |
| 19 | customers | 1:N | bookings | customer_id |
| 20 | services | 1:N | bookings | service_id |
| 21 | booking_statuses | 1:N | bookings | booking_status_id |
| 22 | bookings | 1:1 | tracking_codes | booking_id (UQ) |
| 23 | superadmins | 1:N | superadmin_emails | superadmin_id |
| 24 | tenants | 1:N | tenant_emails | tenant_id |
| 25 | tenants | 1:N | tenant_phones | tenant_id |
| 26 | tenant_owners | 1:N | owner_emails | owner_id |
| 27 | tenant_owners | 1:N | owner_phones | owner_id |
| 28 | customers | 1:N | customer_emails | customer_id |
| 29 | customers | 1:N | customer_phones | customer_id |
| 30 | addresses | 1:N | locations | address_id |
| 31 | locations | 1:N | location_phones | location_id |
