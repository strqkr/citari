-- 02-create-tables.sql
-- Project: Citari
-- Creates the 24 tables and their relationships.
-- Normalized to 3NF: email and phone are multi-valued attributes and live
-- in their own per-entity tables (superadmins, tenants, tenant_owners,
-- customers, locations); a location's territorial division (province/
-- canton/district/postal code) lives in the reusable addresses catalog.

USE citari;
GO

-- Catalogs

CREATE TABLE business_types (
    business_type_id INT IDENTITY(1,1) PRIMARY KEY,
    name             NVARCHAR(100) NOT NULL UNIQUE,
    description      NVARCHAR(500) NULL,
    is_active        BIT NOT NULL DEFAULT 1
);
PRINT '[02-create-tables] table business_types ... OK';
GO

CREATE TABLE tenant_statuses (
    tenant_status_id INT IDENTITY(1,1) PRIMARY KEY,
    name             NVARCHAR(50) NOT NULL UNIQUE,
    description      NVARCHAR(200) NULL
);
PRINT '[02-create-tables] table tenant_statuses ... OK';
GO

CREATE TABLE booking_statuses (
    booking_status_id INT IDENTITY(1,1) PRIMARY KEY,
    name              NVARCHAR(50) NOT NULL UNIQUE,
    description       NVARCHAR(200) NULL
);
PRINT '[02-create-tables] table booking_statuses ... OK';
GO

-- Addresses
-- Territorial division catalog (province/canton/district/postal code):
-- kept separate from locations because the detailed street address lives on
-- the location itself, while the territorial division is a catalog reused
-- across multiple locations.
CREATE TABLE addresses (
    address_id  INT IDENTITY(1,1) PRIMARY KEY,
    province    NVARCHAR(100) NOT NULL,
    canton      NVARCHAR(100) NOT NULL,
    district    NVARCHAR(100) NOT NULL,
    postal_code NVARCHAR(10) NOT NULL
);
PRINT '[02-create-tables] table addresses ... OK';
GO

-- Superadmins

CREATE TABLE superadmins (
    superadmin_id  INT IDENTITY(1,1) PRIMARY KEY,
    first_name     NVARCHAR(100) NOT NULL,
    last_name_1    NVARCHAR(100) NOT NULL,
    last_name_2    NVARCHAR(100) NULL,
    password_hash  NVARCHAR(512) NOT NULL,
    is_active      BIT NOT NULL DEFAULT 1,
    created_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table superadmins ... OK';
GO

-- email is multi-valued (1NF): a superadmin can have more than one email
-- address, so it lives in its own table.
CREATE TABLE superadmin_emails (
    superadmin_email_id INT IDENTITY(1,1) PRIMARY KEY,
    superadmin_id        INT NOT NULL REFERENCES superadmins(superadmin_id),
    email                 NVARCHAR(254) NOT NULL UNIQUE
);
PRINT '[02-create-tables] table superadmin_emails ... OK';
GO

-- Tenants and owners

CREATE TABLE tenants (
    tenant_id        INT IDENTITY(1,1) PRIMARY KEY,
    business_type_id INT NOT NULL REFERENCES business_types(business_type_id),
    tenant_status_id INT NOT NULL REFERENCES tenant_statuses(tenant_status_id),
    name             NVARCHAR(200) NOT NULL,
    slug             NVARCHAR(100) NOT NULL UNIQUE,
    description      NVARCHAR(MAX) NULL,
    logo_url         NVARCHAR(500) NULL,
    public_message   NVARCHAR(500) NULL,
    is_active        BIT NOT NULL DEFAULT 1,
    created_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table tenants ... OK';
GO

-- email and phone are multi-valued (1NF): a tenant can publish more than one
-- contact email/phone, so they live in their own tables.
CREATE TABLE tenant_emails (
    tenant_email_id INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(tenant_id),
    email           NVARCHAR(254) NOT NULL
);
PRINT '[02-create-tables] table tenant_emails ... OK';
GO

CREATE TABLE tenant_phones (
    tenant_phone_id INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(tenant_id),
    phone           NVARCHAR(30) NOT NULL
);
PRINT '[02-create-tables] table tenant_phones ... OK';
GO

CREATE TABLE tenant_owners (
    owner_id       INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id      INT NOT NULL REFERENCES tenants(tenant_id),
    first_name     NVARCHAR(100) NOT NULL,
    last_name_1    NVARCHAR(100) NOT NULL,
    last_name_2    NVARCHAR(100) NULL,
    password_hash  NVARCHAR(512) NOT NULL,
    is_active      BIT NOT NULL DEFAULT 1,
    created_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table tenant_owners ... OK';
GO

-- email and phone are multi-valued (1NF): an owner can register more than
-- one contact email/phone, so they live in their own tables.
CREATE TABLE owner_emails (
    owner_email_id INT IDENTITY(1,1) PRIMARY KEY,
    owner_id       INT NOT NULL REFERENCES tenant_owners(owner_id),
    email          NVARCHAR(254) NOT NULL
);
PRINT '[02-create-tables] table owner_emails ... OK';
GO

CREATE TABLE owner_phones (
    owner_phone_id INT IDENTITY(1,1) PRIMARY KEY,
    owner_id       INT NOT NULL REFERENCES tenant_owners(owner_id),
    phone          NVARCHAR(30) NOT NULL
);
PRINT '[02-create-tables] table owner_phones ... OK';
GO

-- Customers

CREATE TABLE customers (
    customer_id   INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id     INT NOT NULL REFERENCES tenants(tenant_id),
    first_name    NVARCHAR(100) NOT NULL,
    last_name_1   NVARCHAR(100) NOT NULL,
    last_name_2   NVARCHAR(100) NULL,
    notes         NVARCHAR(500) NULL,
    created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table customers ... OK';
GO

-- email and phone are multi-valued (1NF): a customer can book with more than
-- one contact email/phone, so they live in their own tables.
CREATE TABLE customer_emails (
    customer_email_id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id        INT NOT NULL REFERENCES customers(customer_id),
    email               NVARCHAR(254) NOT NULL
);
PRINT '[02-create-tables] table customer_emails ... OK';
GO

CREATE TABLE customer_phones (
    customer_phone_id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id         INT NOT NULL REFERENCES customers(customer_id),
    phone                NVARCHAR(30) NOT NULL
);
PRINT '[02-create-tables] table customer_phones ... OK';
GO

-- Services

CREATE TABLE service_categories (
    category_id   INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id     INT NOT NULL REFERENCES tenants(tenant_id),
    name          NVARCHAR(150) NOT NULL,
    description   NVARCHAR(500) NULL,
    is_active     BIT NOT NULL DEFAULT 1,
    created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table service_categories ... OK';
GO

CREATE TABLE services (
    service_id       INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(tenant_id),
    category_id      INT NOT NULL REFERENCES service_categories(category_id),
    name             NVARCHAR(200) NOT NULL,
    description      NVARCHAR(MAX) NULL,
    duration_minutes INT NOT NULL,
    price            DECIMAL(10,2) NULL,
    show_price       BIT NOT NULL DEFAULT 0,
    is_active        BIT NOT NULL DEFAULT 1,
    created_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table services ... OK';
GO

-- Locations and business hours

CREATE TABLE locations (
    location_id   INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id     INT NOT NULL REFERENCES tenants(tenant_id),
    address_id    INT NOT NULL REFERENCES addresses(address_id),
    name          NVARCHAR(200) NOT NULL,
    is_main       BIT NOT NULL DEFAULT 0,
    is_active     BIT NOT NULL DEFAULT 1,
    created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table locations ... OK';
GO

-- phone is multi-valued (1NF): a location can publish more than one contact
-- phone, so it lives in its own table.
CREATE TABLE location_phones (
    location_phone_id INT IDENTITY(1,1) PRIMARY KEY,
    location_id         INT NOT NULL REFERENCES locations(location_id),
    phone                NVARCHAR(30) NOT NULL
);
PRINT '[02-create-tables] table location_phones ... OK';
GO

CREATE TABLE business_hours (
    business_hour_id INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(tenant_id),
    location_id      INT NOT NULL REFERENCES locations(location_id),
    day_of_week      TINYINT NOT NULL,
    open_time        TIME NULL,
    close_time       TIME NULL,
    is_closed        BIT NOT NULL DEFAULT 0,
    updated_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table business_hours ... OK';
GO

CREATE TABLE availability_blocks (
    availability_block_id INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id              INT NOT NULL REFERENCES tenants(tenant_id),
    location_id            INT NOT NULL REFERENCES locations(location_id),
    block_date             DATE NOT NULL,
    start_time             DATETIME2 NOT NULL,
    end_time               DATETIME2 NOT NULL,
    is_active              BIT NOT NULL DEFAULT 1,
    created_at             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table availability_blocks ... OK';
GO

-- Bookings

CREATE TABLE bookings (
    booking_id             INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id              INT NOT NULL REFERENCES tenants(tenant_id),
    customer_id            INT NOT NULL REFERENCES customers(customer_id),
    service_id             INT NOT NULL REFERENCES services(service_id),
    location_id            INT NOT NULL REFERENCES locations(location_id),
    availability_block_id  INT NULL REFERENCES availability_blocks(availability_block_id) ON DELETE SET NULL,
    booking_status_id      INT NOT NULL REFERENCES booking_statuses(booking_status_id),
    start_time             DATETIME2 NOT NULL,
    end_time               DATETIME2 NOT NULL,
    customer_notes         NVARCHAR(500) NULL,
    internal_notes         NVARCHAR(500) NULL,
    created_at             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
-- FILTERED unique index (not a plain UNIQUE constraint): a block can only be
-- held by one booking at a time, but multiple cancelled/rescheduled bookings
-- can have NULL (the release-on-cancel trigger sets the FK to NULL, keeping
-- the booking's own start_time/end_time as history).
CREATE UNIQUE INDEX ux_bookings_availability_block
    ON bookings(availability_block_id)
    WHERE availability_block_id IS NOT NULL;
PRINT '[02-create-tables] table bookings ... OK';
GO

CREATE TABLE tracking_codes (
    tracking_id     INT IDENTITY(1,1) PRIMARY KEY,
    booking_id      INT NOT NULL UNIQUE REFERENCES bookings(booking_id),
    tracking_code   NVARCHAR(50) NOT NULL UNIQUE,
    expires_at      DATETIME2 NOT NULL,
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table tracking_codes ... OK';
GO

-- Audit

CREATE TABLE audit_logs (
    audit_id      BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id     INT NULL REFERENCES tenants(tenant_id),
    owner_id      INT NULL REFERENCES tenant_owners(owner_id),
    superadmin_id INT NULL REFERENCES superadmins(superadmin_id),
    action        NVARCHAR(100) NOT NULL,
    entity_name   NVARCHAR(100) NOT NULL,
    entity_id     INT NOT NULL,
    old_value     NVARCHAR(MAX) NULL,
    new_value     NVARCHAR(MAX) NULL,
    created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
PRINT '[02-create-tables] table audit_logs ... OK';
GO

PRINT '[02-create-tables] 24/24 tables created';
GO
