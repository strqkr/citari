# Citari: Citari

Base document for the Citari project.

## Table of contents

- [Project overview](#project-overview)
- [General objective](#general-objective)
- [Specific objectives](#specific-objectives)
- [Project scope](#project-scope)
- [System actors](#system-actors)
- [General system flow](#general-system-flow)
- [Important concepts for the team](#important-concepts-for-the-team)
- [Functional requirements](#functional-requirements)
- [Non-functional requirements](#non-functional-requirements)

This document lays out a clear, defensible, and realistic version of the Citari project.

The main idea is to build a booking platform for service businesses, where each business can configure its own information, services, schedules, and bookings. The system will be multi-tenant, meaning several businesses can use the same platform, each managing only its own data.

## Project overview

Citari is a web-based booking platform for service businesses such as barbershops, beauty salons, spas, veterinary clinics, small clinics, professional offices, aesthetic centers, or similar businesses.

Each business will have its own space within the system. That space is called a tenant.

A business owner is the person who owns or manages the business. This person can log in to the private panel to configure their business, create services, define available schedules, and review bookings.

End customers can visit a business's public page, select a service, choose an available date and time, enter their information, and confirm a booking without needing to log in. When they finish, they receive a tracking code to look up, cancel, or reschedule their booking.

The project is built with the following stack:

- SQL Server
- -> FastAPI + Uvicorn + Python
- -> Next.js + TypeScript
- -> Docker

The main priority is the relational database, with a normalized design, well-defined relationships, scripts, stored procedures, functions, views, and triggers.

## General objective

Design and implement a relational database for a multi-tenant booking platform, applying requirements analysis, entity-relationship modeling, relational modeling, normalization up to third normal form, table creation, data insertion, stored procedures, functions, views, triggers, and complete scripts.

## Specific objectives

1. Analyze how a booking platform for service businesses works.
2. Identify the entities needed to represent tenants, owners, customers, services, schedules, and bookings.
3. Define the system's functional and non-functional requirements.
4. Design the Entity-Relationship Diagram (ERD).
5. Transform the ERD into a relational model.
6. Define primary keys, foreign keys, and relationships between tables.
7. Normalize the database up to third normal form.
8. Create the database in SQL Server using DDL scripts.
9. Insert at least 50 records per table using test data.
10. Create at least 10 stored procedures.
11. Create at least 5 SQL functions.
12. Create at least 5 SQL views that integrate multiple tables.
13. Create at least 5 triggers.
14. Create a complete SQL file that can rebuild the entire database.
15. Integrate the database with a FastAPI backend.
16. Create a Next.js web interface to demonstrate the main flow.
17. Dockerize the project to run the database, backend, and frontend.

## Project scope

The project must be functional, but without adding unnecessary complexity. The goal is not to build a complete production-ready SaaS from day one, but a solid version that can grow later.

The MVP includes:

- Registration or creation of businesses/tenants.
- Activation or suspension of tenants by a superadmin.
- Business owner login.
- Private panel for the business owner.
- Basic business configuration.
- Creation of service categories.
- Creation of services.
- Configuration of business hours.
- Creation of availability blocks.
- Public booking page for each tenant.
- Booking creation without login.
- Tracking code generation.
- Public booking lookup by code.
- Booking cancellation by code.
- Booking rescheduling by code.
- Basic booking management from the private panel.
- Basic reports.
- Basic audit logging of important actions.

The MVP does not include:

- Payment gateways.
- Invoicing.
- Visible pricing plans.
- Pricing section on the landing page.
- Paid memberships.
- Email notifications.
- WhatsApp notifications.
- Advanced roles within the tenant.
- Complex permissions.
- Multiple employees with separate schedules.
- Mobile app.
- Kubernetes.
- Microservices.
- Cloud production deployment.

The price field may exist on services, but it is purely informational. The business owner can decide whether to show the service price or not.

## System actors

To keep the system simple, three main actors are defined.

| Actor | Description | Access |
| --- | --- | --- |
| Superadmin | Represents Citari's owners. Can activate or suspend tenants. | Simple internal panel. |
| Business owner | Owner of the business. Manages their tenant, services, schedules, and bookings. | Private panel. |
| Customer | Person booking a service. Does not need an account. | Public page and tracking. |

## General system flow

#### Superadmin flow

1. The superadmin logs into the internal panel.
2. Views the registered/created tenants.
3. Reviews each tenant's status.
4. Activates a tenant to allow it to operate.
5. Suspends a tenant if necessary.
6. Reviews basic information about registered businesses.

This flow is kept simple. It is not the core focus of the project, but it shows that the system can have internal control if it ever becomes a real product.

#### Business owner flow

1. The business owner logs in.
2. Enters their business dashboard.
3. Configures basic tenant information.
4. Creates service categories.
5. Creates services with duration, description, and an optional informational price.
6. Defines the business's general schedule.
7. Defines availability blocks for bookings.
8. Reviews received bookings.
9. Confirms, cancels, completes, or reschedules bookings.
10. Reviews basic reports.

#### End customer flow

1. The customer visits the business's public page.
2. Reviews the business information.
3. Selects a service.
4. Selects a date.
5. Selects an available time.
6. Enters name, email, and phone.
7. Confirms the booking.
8. The system generates a tracking code.
9. The customer can look up their booking using that code.
10. The customer can cancel or reschedule the booking without logging in.

## Important concepts for the team

| Term | Full name | Simple explanation |
| --- | --- | --- |
| PK | Primary Key | Field that uniquely identifies a record. Example: tenant_id. |
| FK | Foreign Key | Field that connects one table to another. Example: business_type_id in tenants. |
| ERD | Entity-Relationship Diagram | Visual diagram showing tables, attributes, and relationships. |
| DDL | Data Definition Language | SQL commands to create structures: databases, tables, keys, and relationships. |
| DML | Data Manipulation Language | SQL commands to insert, update, or delete data. |
| Seed data | Initial test data | Fake data used to test the database. |
| 3NF | Third Normal Form | Normalization level that helps avoid repeated data and incorrect dependencies. |
| Procedure | Stored procedure | Saved SQL block that performs an action. |
| Function | SQL function | SQL block that returns a value. |
| View | SQL view | Saved query that combines data from multiple tables. |
| Trigger | SQL trigger | Automatic action that runs on insert, update, or delete. |
| Tenant | Business within the system | Each barbershop, spa, salon, or veterinary clinic registered. |
| Multi tenant | Multi-business | A single platform that serves several separate businesses. |
| API | Application programming interface | Layer that lets frontend and backend communicate. |
| Endpoint | API route | Specific address for executing an action. Example: GET /services. |
| CRUD | Create, Read, Update, Delete | Create, read, update, and delete data. |
| Docker | Container platform | Lets the project run in controlled environments. |
| Docker Compose | Container orchestrator | File that brings up SQL Server, API, and frontend together. |
| Monorepo | Single repository | One repository for frontend, backend, database, and infrastructure. |

## Functional requirements

- Registration or creation of businesses/tenants.
- Activation or suspension of tenants by a superadmin.
- Business owner login.
- Private panel for the business owner.
- Basic business configuration.
- Creation of service categories.
- Creation of services.
- Configuration of business hours.
- Creation of availability blocks.
- Public booking page for each tenant.
- Booking creation without login.
- Tracking code generation.
- Public booking lookup by code.
- Booking cancellation by code.
- Booking rescheduling by code.
- Basic booking management from the private panel.
- Basic reports.
- Basic audit logging of important actions.

## Non-functional requirements

- Architecture: SQL Server -> FastAPI + Uvicorn + Python -> Next.js + TypeScript -> Docker.
- Database normalized to at least 3NF.
- Complete SQL scripts (DDL, seed data, procedures, functions, views, triggers).
- Multi tenant with data isolation per business.
- Defined public and private endpoints.
- Working Docker Compose for SQL Server, API, and frontend.
