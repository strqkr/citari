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
