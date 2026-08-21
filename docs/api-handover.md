# API handover for the frontend team

Handover document for the Citari API (FastAPI) to the frontend team
(Next.js). Covers API conventions, the full endpoint catalog, curl
examples tested against the real API, domain/booking statuses, the
logging standard, and remaining work on the frontend side.

## Table of contents

- [Overview](#overview)
- [Conventions](#conventions)
- [Endpoint catalog](#endpoint-catalog)
- [SQL Server THROW codes -> HTTP](#sql-server-throw-codes---http)
- [curl examples](#curl-examples)
- [Domain and booking statuses](#domain-and-booking-statuses)
- [Logging standard](#logging-standard)
- [Remaining frontend work](#remaining-frontend-work)
- [Known limitations](#known-limitations)

## Overview

The API is a thin FastAPI layer over SQL Server: each router calls a
service, which calls a repository, which executes a stored procedure or
queries a view. Business logic (validation, transactions, tracking-code
generation, releasing blocks) lives in SQL, not in Python. The
database's table/column names are English ASCII (`tenants`, `bookings`,
`availability_block_id`, ...) and so is the JSON contract exposed by the
API (`tenantId`, `bookingId`, `availabilityBlockId`, ...) — the mappers
in `apps/api/app/mappers/` still exist as the single place that
translates snake_case DB rows into camelCase API responses, but there is
no language boundary anymore between the two. Authentication is JWT
(HS256) with two roles, `owner` and `superadmin`; the owner's `tenantId`
travels as a token claim, never as a URL/body/query parameter — the
frontend doesn't need to (and must not) send it.

## Conventions

**Base URL**: every business endpoint hangs off `/api/v1` (for example
`http://localhost:8000/api/v1/bookings`). `GET /health` and `GET /ready`
are the only exception, they live at the root.

**Format**: JSON in camelCase, both in request bodies and responses.
Internally the Python code is snake_case; the conversion is done by
`CamelModel` (Pydantic `alias_generator=to_camel`) in
`apps/api/app/schemas/`.

**Authentication**: `POST /auth/login` returns `accessToken` (JWT) +
`user`. Every protected endpoint expects the header:

```
Authorization: Bearer <accessToken>
```

There are two guards: `owner` (requires `tenantId` in the claim, used by
the business back-office endpoints) and `superadmin` (used by
`/admin/*` and `/audit-logs`). A token for one role doesn't work on an
endpoint that requires the other (`403 owner role required` /
`403 superadmin role required`).

**Error envelope (RFC 7807 / `application/problem+json`)**: every error
response (400/401/403/404/409/422/500) has this shape:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Tenant 999999 does not exist.",
  "traceId": "6e1653b5a7cc"
}
```

`detail` is the actual message (it comes straight from SQL Server's
`THROW`). `traceId` is the same value as that request's `X-Request-ID`
header — use it when reporting a bug so the backend team can locate the
exact log line.

**Pagination**: list endpoints return an envelope, not a plain array:

```json
{
  "items": [ /* ... */ ],
  "page": 1,
  "pageSize": 2,
  "total": 2
}
```

Query params: `page` (default 1, 1-based) and `pageSize` (alias of
`page_size`, default 20, max 100).

**Request correlation**: every response carries an `X-Request-ID`
header (reused if the client already sends one, otherwise the API
generates one). That id shows up in every backend log line for that
request and as `traceId` in error bodies — it's the thread that
correlates a frontend bug report with the backend logs.

## Endpoint catalog

`owner` = requires `Authorization: Bearer <token>` with role `owner`.
`superadmin` = same, role `superadmin`. `public` = no authentication.
The "SP / view" column names the stored procedure or SQL Server view
that backs the endpoint; "raw SQL" means a parameterized INSERT/UPDATE/
SELECT with no SP (there is no SP for that table, see
`docs/sql-signatures.md`).

Table generated from the running API's `openapi.json` (`citari-api:dev`
image) and cross-checked against the code in `apps/api/app/routers/`.
60 operations (method+path), 43 unique paths, 100% coverage.

### Health

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/health` | public | Liveness check, does not touch the database | N/A |
| GET | `/ready` | public | Readiness check (`SELECT 1` against SQL Server) | N/A |

### Authentication (`/auth`)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | public | Login for owner or superadmin, returns `accessToken` | SELECT `tenant_owners` / `superadmins` + bcrypt verification |
| POST | `/auth/register-owner` | public | Self-registration: creates the tenant and its owner in one flow | `sp_create_tenant` + `sp_create_owner` |
| GET | `/auth/me` | owner or superadmin | Data for the user owning the current token | SELECT `tenant_owners` / `superadmins` |
| POST | `/auth/logout` | public | Invalidates the session client-side (no token blacklist) | N/A |

### Tenant administration (`/admin/tenants`, superadmin)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/admin/tenants` | superadmin | Lists all tenants, paginated | SELECT `tenants` + `tenant_statuses` |
| POST | `/admin/tenants` | N/A | **Intentionally 501 Not Implemented**: actual tenant creation goes through `POST /auth/register-owner`, see note below | N/A |
| GET | `/admin/tenants/{tenant_id}` | superadmin | Tenant detail | SELECT `tenants` + `tenant_statuses` |
| POST | `/admin/tenants/{tenant_id}/activate` | superadmin | Activates a tenant (pending/suspended -> active) | `sp_activate_tenant` |
| POST | `/admin/tenants/{tenant_id}/suspend` | superadmin | Suspends an active tenant | `sp_suspend_tenant` |

Note on `POST /admin/tenants`: it's left as a 501 stub on purpose. The
only supported path to create a tenant is `POST /auth/register-owner`
(creates tenant + owner in a single call). There is no "admin creates a
tenant without an owner" flow.

### Own tenant (`/tenant`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/tenant/current` | owner | Own tenant data (via the JWT's `tenantId`) | SELECT `tenants` |
| PATCH | `/tenant/current` | owner | Updates own tenant data | raw SQL (UPDATE `tenants`) |

### Catalogs (`/business-types`, public)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/business-types` | public | Lists active business types (for the new-tenant registration form) | SELECT `business_types` |

### Service categories (`/service-categories`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/service-categories` | owner | Lists the tenant's categories, paginated | SELECT `service_categories` |
| POST | `/service-categories` | owner | Creates a category | raw SQL (INSERT) |
| GET | `/service-categories/{category_id}` | owner | Category detail | SELECT `service_categories` |
| PATCH | `/service-categories/{category_id}` | owner | Updates category fields | raw SQL (UPDATE) |
| DELETE | `/service-categories/{category_id}` | owner | Soft delete (`is_active = 0`) | raw SQL (UPDATE) |

### Services (`/services`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/services` | owner | Lists the tenant's services, paginated | SELECT `services` |
| POST | `/services` | owner | Creates a service | `sp_create_service` |
| GET | `/services/{service_id}` | owner | Service detail | SELECT `services` |
| PATCH | `/services/{service_id}` | owner | Updates fields (COALESCE pattern, NULL = no change) | `sp_update_service` |
| DELETE | `/services/{service_id}` | owner | Soft delete (`is_active = 0`) | `sp_update_service` |

### Locations (`/locations`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/locations` | owner | Lists the tenant's locations, paginated | SELECT `locations` |
| POST | `/locations` | owner | Creates a location | raw SQL (INSERT) |
| GET | `/locations/{location_id}` | owner | Location detail | SELECT `locations` |
| PATCH | `/locations/{location_id}` | owner | Updates fields | raw SQL (UPDATE) |
| DELETE | `/locations/{location_id}` | owner | Soft delete (`is_active = 0`) | raw SQL (UPDATE) |

### Business hours (`/business-hours`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/business-hours` | owner | Lists the weekly schedule (filterable by location) | SELECT `business_hours` |
| PUT | `/business-hours` | owner | Replaces a location's entire weekly schedule | raw SQL (DELETE + INSERT of the previous set) |

### Availability blocks (`/availability-blocks`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/availability-blocks` | owner | Lists the tenant's blocks | `v_availability_status` |
| POST | `/availability-blocks` | owner | Creates an availability block | `sp_create_availability_block` |
| GET | `/availability-blocks/{availability_block_id}` | owner | Block detail | `v_availability_status` |
| DELETE | `/availability-blocks/{availability_block_id}` | owner | Deactivates the block (`is_active = 0`) | raw SQL (UPDATE) |

### Customers (`/customers`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/customers` | owner | Lists the tenant's customers, paginated | SELECT `customers` |
| POST | `/customers` | owner | Creates a customer (or reuses an existing one by tenant+email) | `sp_create_customer` |
| GET | `/customers/{customer_id}` | owner | Customer detail | SELECT `customers` |
| PATCH | `/customers/{customer_id}` | owner | Updates contact data | raw SQL (UPDATE) |
| GET | `/customers/{customer_id}/bookings` | owner | Customer's booking history | `v_customer_booking_history` |

### Bookings (`/bookings`, owner: internal business back-office)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/bookings` | owner | Lists the tenant's bookings (filters, paginated) | `v_booking_details` |
| POST | `/bookings` | owner | Creates a booking (existing customer or new contact data) | `sp_create_booking` |
| GET | `/bookings/{booking_id}` | owner | Booking detail | `v_booking_details` |
| POST | `/bookings/{booking_id}/confirm` | owner | Confirms a pending booking | `sp_confirm_booking` |
| POST | `/bookings/{booking_id}/cancel` | owner | Cancels a booking | `sp_cancel_booking` |
| POST | `/bookings/{booking_id}/complete` | owner | Marks a booking as completed | `sp_complete_booking` |
| POST | `/bookings/{booking_id}/reschedule` | owner | Reschedules the booking to a different availability block | `sp_reschedule_booking` |

### Reports (`/reports`, owner)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/reports/dashboard` | owner | Tenant summary metrics (totals, pending, confirmed, ...) | `v_tenant_dashboard` |
| GET | `/reports/daily-agenda` | owner | Agenda for a specific day | `v_daily_agenda` |
| GET | `/reports/bookings-detail` | owner | Paginated booking detail, with report filters | `v_booking_details` |
| GET | `/reports/services-demand` | owner | Demand (total bookings) per service | `v_service_demand` |
| GET | `/reports/availability-status` | owner | Status of a day's blocks (free/taken) | `v_availability_status` |

### Audit (`/audit-logs`, superadmin)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/audit-logs` | superadmin | Global paginated list of audit logs | SELECT `audit_logs` |

### Public storefront (`/public/{slug}`, no authentication)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/public/{slug}` | public | Active tenant data by slug (404 if it doesn't exist or isn't active) | SELECT `tenants` |
| GET | `/public/{slug}/services` | public | Active, publishable services for that tenant | `v_public_services` |
| GET | `/public/{slug}/availability` | public | Available blocks (active, not booked); optional `date`/`locationId` filters | `v_availability_status` |
| POST | `/public/{slug}/bookings` | public | Creates a booking from the public flow (always with new customer data) | `sp_create_booking` (branch without `customerId`, delegates to `sp_create_customer`) |

### Tracking (`/track/{code}`, public via tracking code)

| Method | Path | Auth | Purpose | SP / view |
| --- | --- | --- | --- | --- |
| GET | `/track/{code}` | public | Looks up a booking by its tracking code | `v_booking_details` |
| POST | `/track/{code}/cancel` | public | Cancels the booking associated with that code | `sp_cancel_booking` |
| POST | `/track/{code}/reschedule` | public | Reschedules the booking to a different availability block | `sp_reschedule_booking` |

## SQL Server THROW codes -> HTTP

Stored procedures raise `THROW` with an error number in a fixed range;
the API intercepts it (`apps/api/app/errors.py`) and translates it into
the HTTP status and the RFC 7807 envelope. General range:
50001-50019 validation (400), 50020-50039 not found (404), 50040-50059
conflict (409).

| Code | Meaning | HTTP |
| --- | --- | --- |
| 50001 | The tenant is not active | 400 |
| 50002 | The slug is already in use by another tenant | 400 |
| 50003 | The current booking status does not allow the requested transition | 400 |
| 50004 | Invalid block date range (`start_time >= end_time`) | 400 |
| 50005 | You must provide `customer_id` or the complete customer data | 400 |
| 50020 | The business type does not exist | 404 |
| 50021 | The tenant does not exist | 404 |
| 50022 | The superadmin does not exist | 404 |
| 50023 | The category does not exist or does not belong to the tenant | 404 |
| 50024 | The service does not exist or does not belong to the tenant | 404 |
| 50025 | The location does not exist or does not belong to the tenant | 404 |
| 50026 | The availability block does not exist or does not belong to the tenant/location | 404 |
| 50027 | The customer does not exist or does not belong to the tenant | 404 |
| 50028 | The booking does not exist or does not belong to the tenant | 404 |
| 50040 | The availability block is already taken or has an active booking | 409 |
| 50041 | The block overlaps with an existing active block at the same location | 409 |
| 50042 | The new availability block (reschedule) is already taken | 409 |
| 50043 | More than one non-cancelled booking points to the same block (defense in depth, trigger) | 409 |

See `docs/sql-signatures.md` §5 for the canonical, up-to-date version of
this table (source of truth). Any SQL Server error that doesn't carry
one of these codes (e.g. an unrelated constraint violation not tied to a
business `THROW`) falls through to a generic `500 Internal Server
Error`.

## curl examples

All tested against the real API (`citari-api:dev`, local `docker
compose`) with the seed data from `database/PASSWORDS.md`. Replace
`http://localhost:8000` with the real environment URL.

### Owner login

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"daniel.whitmore@example.com","password":"bowner123","role":"owner"}'
```

Response (200):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "bearer",
  "user": {
    "id": 1,
    "firstName": "Daniel",
    "lastName": "Whitmore",
    "email": "daniel.whitmore@example.com",
    "role": "owner",
    "tenantId": 1
  }
}
```

### Superadmin login

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ava.whitfield@citari.admin","password":"Admin123","role":"superadmin"}'
```

Response (200): same shape, `role: "superadmin"` and `tenantId: null`.

### Public booking flow (slug -> services -> availability -> create -> track -> cancel)

```bash
# 1. public tenant data
curl -s http://localhost:8000/api/v1/public/copper-blade-barbershop

# 2. publishable services
curl -s http://localhost:8000/api/v1/public/copper-blade-barbershop/services

# 3. availability (optionally filtered by date)
curl -s "http://localhost:8000/api/v1/public/copper-blade-barbershop/availability?date=2026-08-20"

# 4. create the booking (serviceId/locationId/availabilityBlockId come from steps 2 and 3)
curl -s -X POST http://localhost:8000/api/v1/public/copper-blade-barbershop/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": 1,
    "locationId": 1,
    "availabilityBlockId": 120,
    "customer": {
      "firstName": "Ana",
      "lastName": "Rojas",
      "email": "ana.rojas.demo@example.com",
      "phone": "8888-1234"
    },
    "customerNotes": "First visit"
  }'
```

Response of step 4 (201), carries the `trackingCode` the public customer
needs to save:

```json
{
  "bookingId": 103,
  "customerName": "Ana Rojas",
  "serviceName": "Classic Haircut",
  "bookingDate": "2026-08-20",
  "startTime": "10:00:00",
  "status": "pending",
  "trackingCode": "CITARI-R287GU",
  "endTime": "10:30:00",
  "locationName": "Downtown Branch",
  "customerNotes": "First visit"
}
```

```bash
# 5. look up by tracking code
curl -s http://localhost:8000/api/v1/track/CITARI-R287GU

# 6. cancel by tracking code
curl -s -X POST http://localhost:8000/api/v1/track/CITARI-R287GU/cancel
```

Step 6 responds 200 with `"status":"cancelled"`.

### CRUD with Bearer (create a service, as owner)

```bash
TOKEN="<accessToken from the owner login>"

curl -s -X POST http://localhost:8000/api/v1/services \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 1,
    "name": "Cut + beard",
    "description": "Combo service",
    "durationMinutes": 45,
    "price": 9000,
    "showPrice": true
  }'
```

Response (201):

```json
{
  "serviceId": 66,
  "name": "Cut + beard",
  "description": "Combo service",
  "durationMinutes": 45,
  "price": 9000.0,
  "showPrice": true
}
```

### Report (tenant dashboard)

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/reports/dashboard
```

Response (200):

```json
{
  "tenantId": 1,
  "name": "Copper & Blade Barbershop",
  "totalBookings": 2,
  "pendingBookings": 1,
  "confirmedBookings": 0,
  "cancelledBookings": 1,
  "totalCustomers": 2,
  "totalActiveServices": 2,
  "totalActiveLocations": 1
}
```

## Domain and booking statuses

**Bookings** (`booking_statuses.name` in the database) is stored in
English directly and passed straight through to the JSON `status` field
— no translation/mapping happens on either side
(`apps/api/app/mappers/booking_mapper.py` is a pure passthrough, see the
docstring there). Possible values:

- `pending`
- `confirmed`
- `cancelled`
- `completed`
- `rescheduled`

The `?status=` filter on `GET /bookings` takes one of these English
values directly and is passed as-is into the SQL `WHERE` clause (see
`apps/api/app/repositories/booking_repository.py`).

**Tenants** (`tenant_statuses.name`): same story — the `status` field
of `TenantResponse` (visible on `GET /admin/tenants/{id}`) is an English
string straight from the database, no mapping needed on the frontend.
Possible values:

- `pending`
- `active`
- `suspended`
- `inactive`

## Logging standard

Every request emits a log line with `request_id` (the same value as the
`X-Request-ID`/`traceId` header), method, path, the SP invoked
(`sp=...` or `-` if not applicable), duration in ms, and HTTP status.
Two possible formats (`LOG_FORMAT=json` by default, or `dev` for a
human-readable pipe-delimited line in development); neither format logs
passwords, hashes, tokens, or bodies with PII — only IDs and request
metadata.

## Remaining frontend work

The API already covers every use case in the project (public
storefront, tracking, auth, business CRUD, reports, admin, audit).
What's left is wiring the frontend up to those real endpoints:

- **Private CRUD screens** (categories, services, locations, hours,
  availability blocks, customers, bookings, reports, superadmin panel):
  still consume `apps/frontend/lib/mock-data.ts` instead of the real
  API. The public flow (SSR) and the logins are already wired to the
  API; the private screens are not yet.
- **Public booking submission**: `POST /public/{slug}/bookings` already
  exists and works in the API (see the curl example above); it's still
  not wired into the customer/confirmation pages of the frontend's
  `/book/[slug]/*` flow, which today simulate creation against mock
  data.
- **Reschedule from tracking**: `POST /track/{code}/reschedule` already
  exists in the API; the screen/action in `/track/[code]/*` that calls
  it is still missing (today only cancel is wired, if that).
- **Repo-wide broken eslint config**: `pnpm lint` in `apps/frontend`
  fails due to configuration, independent of any given feature's
  changes; not something introduced by this handover, needs to be fixed
  separately.

## Known limitations

- The JWT has no refresh token: once it expires (`JWT_EXPIRES_MIN`, 60
  minutes by default) the user must log in again. There is no renewal
  endpoint.
- `POST /auth/logout` is stateless: it does not invalidate the token
  server-side (no blacklist), it's only a signal for the client to
  discard the token locally. A stolen token remains valid until its
  `exp`.
