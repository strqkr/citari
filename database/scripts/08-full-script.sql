-- 08-full-script.sql
-- Project: Citari
-- Single script that rebuilds the entire database from scratch, in order:
-- database creation, the 24 tables and their relationships, seed data,
-- stored procedures, functions, views, and triggers.

-- SECTION 01. DATABASE CREATION

-- 01-create-database.sql
-- Project: Citari
-- Creates the citari database from scratch.
-- Schema identifiers are in English.

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = N'citari')
BEGIN
    ALTER DATABASE citari SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE citari;
END

CREATE DATABASE citari
COLLATE Latin1_General_CI_AI;
GO

USE citari;
GO

PRINT '[01-create-database] citari database created ... OK';
GO

-- SECTION 02. TABLES AND RELATIONSHIPS

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

-- SECTION 03. SEED DATA

-- 03-seed-data.sql
-- Project: Citari
-- Content: a small, realistic demo dataset (not padded to a row quota).
-- Requires a freshly created database: IDENTITY ids start at 1 and
-- foreign keys are emitted as literal ids matching insertion order.

USE citari;
GO

SET NOCOUNT ON;
GO

INSERT INTO business_types (name, description, is_active) VALUES
    (N'Barbershop', N'Haircuts and grooming for men', 1),
    (N'Hair Salon', N'Hairstyling and beauty services', 1),
    (N'Spa', N'Relaxation and wellness treatments', 1),
    (N'Veterinary Clinic', N'Health services for pets', 1),
    (N'Medical Clinic', N'General medical care', 1),
    (N'Dental Clinic', N'Dental services', 1),
    (N'Wellness Center', N'Holistic and alternative therapies', 1),
    (N'Gym', N'Fitness and strength training', 1),
    (N'Massage Therapy', N'Therapeutic massage', 1),
    (N'Nutrition Counseling', N'Dietary and nutrition consulting', 1),
    (N'Physical Therapy', N'Rehabilitation and physiotherapy', 1),
    (N'Nail Salon', N'Manicure and pedicure services', 1),
    (N'Tattoo Studio', N'Tattoo and body art', 1),
    (N'Yoga Studio', N'Yoga classes', 1),
    (N'Psychology Practice', N'Mental health counseling', 1);
PRINT '[03-seed-data] table business_types ... OK';
GO

INSERT INTO tenant_statuses (name, description) VALUES
    (N'pending', N'Pending approval'),
    (N'active', N'Active and operating'),
    (N'suspended', N'Suspended by an administrator'),
    (N'inactive', N'Inactive or deregistered');
PRINT '[03-seed-data] table tenant_statuses ... OK';
GO

INSERT INTO booking_statuses (name, description) VALUES
    (N'pending', N'Booking pending confirmation'),
    (N'confirmed', N'Booking confirmed'),
    (N'cancelled', N'Booking cancelled'),
    (N'completed', N'Booking completed'),
    (N'rescheduled', N'Booking rescheduled');
PRINT '[03-seed-data] table booking_statuses ... OK';
GO

INSERT INTO superadmins (first_name, last_name_1, last_name_2, password_hash, is_active) VALUES
    (N'Ava', N'Whitfield', NULL, N'$2b$12$HNf7oIJgipKcyCIEJLR1POaKhc46Oh//2IJ7eNtn/Mu5wvNC98qFe', 1),
    (N'Noah', N'Sinclair', N'Reyes', N'$2b$12$HNf7oIJgipKcyCIEJLR1POaKhc46Oh//2IJ7eNtn/Mu5wvNC98qFe', 1);
PRINT '[03-seed-data] table superadmins ... OK';
GO

INSERT INTO superadmin_emails (superadmin_id, email) VALUES
    (1, N'ava.whitfield@citari.admin'),
    (2, N'noah.sinclair@citari.admin');
PRINT '[03-seed-data] table superadmin_emails ... OK';
GO

INSERT INTO tenants (business_type_id, tenant_status_id, name, slug, description, logo_url, public_message, is_active) VALUES
    (1, 2, N'Copper & Blade Barbershop', N'copper-blade-barbershop', N'Classic barbershop offering cuts, shaves, and beard trims.', NULL, N'Walk-ins welcome, but booking ahead saves you the wait.', 1),
    (3, 2, N'Serene Springs Spa', N'serene-springs-spa', N'Full-service spa focused on massage and facial treatments.', NULL, N'Your escape from the everyday, one treatment at a time.', 1),
    (4, 2, N'Willowbrook Veterinary Clinic', N'willowbrook-veterinary', N'Veterinary clinic providing checkups and preventive care for pets.', NULL, N'Caring for your pets like they''re our own.', 1);
PRINT '[03-seed-data] table tenants ... OK';
GO

INSERT INTO tenant_emails (tenant_id, email) VALUES
    (1, N'info@copperandblade.example'),
    (2, N'hello@serenespringsspa.example'),
    (3, N'care@willowbrookvet.example');
PRINT '[03-seed-data] table tenant_emails ... OK';
GO

INSERT INTO tenant_phones (tenant_id, phone) VALUES
    (1, N'2201-1001'),
    (2, N'2201-1002'),
    (3, N'2201-1003');
PRINT '[03-seed-data] table tenant_phones ... OK';
GO

INSERT INTO tenant_owners (tenant_id, first_name, last_name_1, last_name_2, password_hash, is_active) VALUES
    (1, N'Daniel', N'Whitmore', NULL, N'$2b$12$6B3wIs./ish6IGqLCScHCet1uryH9qoa9WPGGqEzBVa47GL7kJHPe', 1),
    (2, N'Priya', N'Anand', N'Marchetti', N'$2b$12$6B3wIs./ish6IGqLCScHCet1uryH9qoa9WPGGqEzBVa47GL7kJHPe', 1),
    (3, N'Marcus', N'Ellery', NULL, N'$2b$12$6B3wIs./ish6IGqLCScHCet1uryH9qoa9WPGGqEzBVa47GL7kJHPe', 1);
PRINT '[03-seed-data] table tenant_owners ... OK';
GO

INSERT INTO owner_emails (owner_id, email) VALUES
    (1, N'daniel.whitmore@example.com'),
    (2, N'priya.anand@example.com'),
    (3, N'marcus.ellery@example.com');
PRINT '[03-seed-data] table owner_emails ... OK';
GO

INSERT INTO owner_phones (owner_id, phone) VALUES
    (1, N'8801-2001'),
    (2, N'8801-2002'),
    (3, N'8801-2003');
PRINT '[03-seed-data] table owner_phones ... OK';
GO

INSERT INTO customers (tenant_id, first_name, last_name_1, last_name_2, notes) VALUES
    (1, N'John', N'Carver', NULL, N'Regular - prefers Saturdays'),
    (1, N'Maria', N'Lopez', N'Bennett', NULL),
    (1, N'Ben', N'Turner', NULL, N'Always asks for the same barber'),
    (2, N'Elena', N'Petrova', NULL, N'Allergic to strong fragrances'),
    (2, N'Sam', N'Okafor', N'Diallo', NULL),
    (3, N'Grace', N'Kim', NULL, N'Has a nervous rescue dog - handle gently'),
    (3, N'Tomas', N'Nowak', NULL, NULL),
    (3, N'Lucia', N'Fernandez', N'Ibarra', N'Cat is due for vaccines');
PRINT '[03-seed-data] table customers ... OK';
GO

INSERT INTO customer_emails (customer_id, email) VALUES
    (1, N'john.carver@example.com'),
    (2, N'maria.lopez@example.com'),
    (3, N'ben.turner@example.com'),
    (4, N'elena.petrova@example.com'),
    (5, N'sam.okafor@example.com'),
    (6, N'grace.kim@example.com'),
    (7, N'tomas.nowak@example.com'),
    (8, N'lucia.fernandez@example.com');
PRINT '[03-seed-data] table customer_emails ... OK';
GO

INSERT INTO customer_phones (customer_id, phone) VALUES
    (1, N'8801-3001'),
    (2, N'8801-3002'),
    (3, N'8801-3003'),
    (4, N'8801-3004'),
    (5, N'8801-3005'),
    (6, N'8801-3006'),
    (7, N'8801-3007'),
    (8, N'8801-3008');
PRINT '[03-seed-data] table customer_phones ... OK';
GO

INSERT INTO service_categories (tenant_id, name, description, is_active) VALUES
    (1, N'Haircuts', N'Haircut services', 1),
    (1, N'Beard & Shave', N'Beard trims and traditional shaves', 1),
    (2, N'Massage', N'Massage therapy', 1),
    (2, N'Facial Treatments', N'Skin care and facials', 1),
    (3, N'Wellness Checkups', N'Routine health checkups', 1),
    (3, N'Vaccinations', N'Preventive vaccination packages', 1);
PRINT '[03-seed-data] table service_categories ... OK';
GO

INSERT INTO services (tenant_id, category_id, name, description, duration_minutes, price, show_price, is_active) VALUES
    (1, 1, N'Classic Haircut', N'Classic Haircut service', 30, 15.00, 1, 1),
    (1, 1, N'Buzz Cut', N'Buzz Cut service', 20, 10.00, 1, 1),
    (1, 2, N'Beard Trim', N'Beard Trim service', 15, 8.00, 1, 1),
    (2, 3, N'Swedish Massage', N'Swedish Massage service', 60, 70.00, 1, 1),
    (2, 3, N'Deep Tissue Massage', N'Deep Tissue Massage service', 60, 85.00, 1, 1),
    (2, 4, N'Hydrating Facial', N'Hydrating Facial service', 45, 60.00, 1, 1),
    (3, 5, N'Annual Checkup', N'Annual Checkup service', 30, 45.00, 1, 1),
    (3, 5, N'Dental Cleaning', N'Dental Cleaning service', 45, 65.00, 1, 1),
    (3, 6, N'Core Vaccine Package', N'Core Vaccine Package service', 20, 35.00, 1, 1);
PRINT '[03-seed-data] table services ... OK';
GO

INSERT INTO addresses (province, canton, district, postal_code) VALUES
    (N'San Jose', N'San Jose', N'Carmen', N'10101'),
    (N'San Jose', N'Escazu', N'San Rafael', N'10203'),
    (N'Heredia', N'Heredia', N'Mercedes', N'40101'),
    (N'Alajuela', N'Alajuela', N'San Jose', N'20101');
PRINT '[03-seed-data] table addresses ... OK';
GO

INSERT INTO locations (tenant_id, address_id, name, is_main, is_active) VALUES
    (1, 1, N'Downtown Branch', 1, 1),
    (1, 2, N'Uptown Branch', 0, 1),
    (2, 3, N'Main Spa', 1, 1),
    (3, 4, N'Main Clinic', 1, 1);
PRINT '[03-seed-data] table locations ... OK';
GO

INSERT INTO location_phones (location_id, phone) VALUES
    (1, N'2256-5501'),
    (2, N'2256-5502'),
    (3, N'2256-5503'),
    (4, N'2256-5504');
PRINT '[03-seed-data] table location_phones ... OK';
GO

INSERT INTO business_hours (tenant_id, location_id, day_of_week, open_time, close_time, is_closed) VALUES
    (1, 1, 0, NULL, NULL, 1),
    (1, 1, 1, '09:00', '19:00', 0),
    (1, 1, 2, '09:00', '19:00', 0),
    (1, 1, 3, '09:00', '19:00', 0),
    (1, 1, 4, '09:00', '19:00', 0),
    (1, 1, 5, '09:00', '19:00', 0),
    (1, 1, 6, '09:00', '19:00', 0),
    (1, 2, 0, NULL, NULL, 1),
    (1, 2, 1, '09:00', '19:00', 0),
    (1, 2, 2, '09:00', '19:00', 0),
    (1, 2, 3, '09:00', '19:00', 0),
    (1, 2, 4, '09:00', '19:00', 0),
    (1, 2, 5, '09:00', '19:00', 0),
    (1, 2, 6, '09:00', '19:00', 0),
    (2, 3, 0, '10:00', '20:00', 0),
    (2, 3, 1, NULL, NULL, 1),
    (2, 3, 2, '10:00', '20:00', 0),
    (2, 3, 3, '10:00', '20:00', 0),
    (2, 3, 4, '10:00', '20:00', 0),
    (2, 3, 5, '10:00', '20:00', 0),
    (2, 3, 6, '10:00', '20:00', 0),
    (3, 4, 0, NULL, NULL, 1),
    (3, 4, 1, '08:00', '17:00', 0),
    (3, 4, 2, '08:00', '17:00', 0),
    (3, 4, 3, '08:00', '17:00', 0),
    (3, 4, 4, '08:00', '17:00', 0),
    (3, 4, 5, '08:00', '17:00', 0),
    (3, 4, 6, '08:00', '17:00', 0);
PRINT '[03-seed-data] table business_hours ... OK';
GO

INSERT INTO availability_blocks (tenant_id, location_id, block_date, start_time, end_time, is_active) VALUES
    (1, 1, '2026-09-03', '2026-09-03T09:00:00', '2026-09-03T09:30:00', 1),
    (1, 1, '2026-09-03', '2026-09-03T10:00:00', '2026-09-03T10:20:00', 1),
    (1, 1, '2026-09-04', '2026-09-04T09:00:00', '2026-09-04T09:15:00', 1),
    (1, 1, '2026-09-04', '2026-09-04T11:00:00', '2026-09-04T11:30:00', 1),
    (1, 2, '2026-09-05', '2026-09-05T09:00:00', '2026-09-05T09:20:00', 1),
    (1, 2, '2026-09-06', '2026-09-06T10:00:00', '2026-09-06T10:15:00', 1),
    (2, 3, '2026-09-03', '2026-09-03T09:00:00', '2026-09-03T10:00:00', 1),
    (2, 3, '2026-09-04', '2026-09-04T11:00:00', '2026-09-04T12:00:00', 1),
    (2, 3, '2026-09-05', '2026-09-05T09:00:00', '2026-09-05T09:45:00', 1),
    (2, 3, '2026-09-06', '2026-09-06T14:00:00', '2026-09-06T15:00:00', 1),
    (3, 4, '2026-09-03', '2026-09-03T09:00:00', '2026-09-03T09:30:00', 1),
    (3, 4, '2026-09-04', '2026-09-04T10:00:00', '2026-09-04T10:45:00', 1),
    (3, 4, '2026-09-05', '2026-09-05T09:00:00', '2026-09-05T09:20:00', 1),
    (3, 4, '2026-09-06', '2026-09-06T11:00:00', '2026-09-06T11:30:00', 1),
    (1, 1, '2026-09-07', '2026-09-07T09:00:00', '2026-09-07T09:30:00', 1),
    (2, 3, '2026-09-08', '2026-09-08T09:00:00', '2026-09-08T10:00:00', 1);
PRINT '[03-seed-data] table availability_blocks ... OK';
GO

INSERT INTO bookings (tenant_id, customer_id, service_id, location_id, availability_block_id, booking_status_id, start_time, end_time, customer_notes, internal_notes) VALUES
    (1, 1, 1, 1, 1, 2, '2026-09-03T09:00:00', '2026-09-03T09:30:00', N'Morning works best for me', NULL),
    (1, 2, 2, 1, 2, 4, '2026-09-03T10:00:00', '2026-09-03T10:20:00', NULL, NULL),
    (1, 3, 3, 1, 3, 1, '2026-09-04T09:00:00', '2026-09-04T09:15:00', N'First time getting a beard trim here', NULL),
    (1, 1, 1, 1, NULL, 3, '2026-09-04T11:00:00', '2026-09-04T11:30:00', N'Something came up, sorry', N'Customer called ahead to cancel'),
    (1, 2, 2, 2, 5, 2, '2026-09-05T09:00:00', '2026-09-05T09:20:00', NULL, NULL),
    (2, 4, 4, 3, 7, 2, '2026-09-03T09:00:00', '2026-09-03T10:00:00', N'Please use unscented oil', NULL),
    (2, 5, 5, 3, 8, 1, '2026-09-04T11:00:00', '2026-09-04T12:00:00', NULL, NULL),
    (2, 4, 6, 3, 9, 4, '2026-09-05T09:00:00', '2026-09-05T09:45:00', NULL, N'Repeat client, very happy with results'),
    (3, 6, 7, 4, 11, 2, '2026-09-03T09:00:00', '2026-09-03T09:30:00', N'Dog gets anxious, please be patient', NULL),
    (3, 7, 8, 4, NULL, 3, '2026-09-04T10:00:00', '2026-09-04T10:45:00', N'Rescheduling for next month', N'Freed up the slot per client request');
PRINT '[03-seed-data] table bookings ... OK';
GO

INSERT INTO tracking_codes (booking_id, tracking_code, expires_at, is_active) VALUES
    (1, N'CITARI-FMT01', '2026-10-03T09:00:00', 1),
    (2, N'CITARI-LYL02', '2026-10-03T10:00:00', 1),
    (3, N'CITARI-RKD03', '2026-10-04T09:00:00', 1),
    (4, N'CITARI-WWW04', '2026-10-04T11:00:00', 1),
    (5, N'CITARI-BHP05', '2026-10-05T09:00:00', 1),
    (6, N'CITARI-GUG06', '2026-10-03T09:00:00', 1),
    (7, N'CITARI-MFZ07', '2026-10-04T11:00:00', 1),
    (8, N'CITARI-SSS08', '2026-10-05T09:00:00', 1),
    (9, N'CITARI-XDK09', '2026-10-03T09:00:00', 1),
    (10, N'CITARI-CQC10', '2026-10-04T10:00:00', 1);
PRINT '[03-seed-data] table tracking_codes ... OK';
GO

INSERT INTO audit_logs (tenant_id, owner_id, superadmin_id, action, entity_name, entity_id, old_value, new_value) VALUES
    (1, 1, NULL, N'tenant_created', N'tenants', 1, NULL, N'Tenant created: Copper & Blade Barbershop'),
    (2, 2, NULL, N'tenant_created', N'tenants', 2, NULL, N'Tenant created: Serene Springs Spa'),
    (3, 3, NULL, N'tenant_created', N'tenants', 3, NULL, N'Tenant created: Willowbrook Veterinary Clinic'),
    (1, 1, NULL, N'booking_confirmed', N'bookings', 1, N'pending', N'confirmed'),
    (2, 2, NULL, N'booking_confirmed', N'bookings', 6, N'pending', N'confirmed'),
    (3, NULL, 1, N'booking_cancelled', N'bookings', 10, N'pending', N'cancelled');
PRINT '[03-seed-data] table audit_logs ... OK';
GO

PRINT '[03-seed-data] 24/24 tables populated';
GO

-- SECTION 04. STORED PROCEDURES

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

-- SECTION 05. FUNCTIONS

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

-- SECTION 06. VIEWS

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

-- SECTION 07. TRIGGERS

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
