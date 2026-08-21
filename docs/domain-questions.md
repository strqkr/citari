# Domain questions

Key questions about the business and its data to guide database design decisions.

---

## Authentication and users

- How many user types does the system handle and which ones need a password in the database?
  - Three: superadmin and business owner store a password. The customer has no account.

- Can an owner manage more than one tenant with the same email?
  - No. Each owner belongs to a single tenant.

- Are customers identified only by email and phone, or do they need their own unique identifier?
  - They have their own ID in the `customers` table, but are publicly identified by email within their tenant.

- Does the system need to store failed login attempts or active sessions?
  - Not for the MVP.

---

## Tenants and businesses

- What minimum information must a tenant have to be considered ready to operate?
  - Name, slug, business type, and at least one registered owner.

- Can a tenant change its business type after registering?
  - Not defined in the project. The field exists in the table, but no endpoint or procedure has been designed for that change.

- Which superadmin actions must be logged in the audit trail?
  - Activating and suspending tenants.

- Can a tenant's slug change once created?
  - No. The slug is used in public URLs and changing it would break existing links.

---

## Services and categories

- Can a service belong to only one category, or several?
  - Only one category.

- Is a service's duration fixed or can it vary per booking?
  - Fixed. Duration is defined on the service and does not change per booking.

- Can a booking include more than one service at the same time?
  - Not for the MVP. A booking corresponds to a single service.

- What happens to existing bookings if a service is deactivated?
  - Existing bookings are not modified. The deactivated service stops appearing for new bookings.

---

## Availability and schedules

- Are availability blocks generated automatically from `business_hours`, or does the owner create them manually?
  - For the MVP they are inserted via seed scripts (`scripts/gen-seed.py`). In production they would be generated from `business_hours`, but that automatic logic is out of scope for now.

- Can a block have capacity for more than one customer at a time?
  - Not for the MVP. Each block admits a single active booking.

- Are there exceptions to the general schedule, such as holidays or special closures?
  - Not for the MVP. The weekly schedule in `business_hours` is fixed.

- What is the minimum duration interval for a block?
  - 30 minutes.

- Can schedules vary by season?
  - Not for the MVP.
---

## Bookings

- How many times can a booking be rescheduled?
  - No limit defined for the MVP.

- Is there a deadline for cancelling or rescheduling?
  - Not for the MVP.

- Does the status change history of a booking need to be stored?
  - The current status is stored in `bookings`. Important changes are logged in `audit_logs`.

- Does a cancelled booking automatically free its availability block?
  - Yes. A trigger or the cancellation procedure marks the block as available again.

- Are customer notes visible to the owner in the private panel?
  - Yes. The owner can see the notes the customer wrote at booking time.

---

## Tracking

- How long is a tracking code valid?
  - 30 days from booking creation.

- Does the code expire even if the booking is still active?
  - Yes. The booking may still exist, but the code no longer works to look it up.

- Can the code be regenerated if it expires?
  - Not for the MVP.

---

## Multi-tenancy and isolation

- Can a customer with the same email have bookings in two different tenants?
  - Yes. Customers are independent per tenant. The same email can exist across multiple businesses with no relation between them.

- Is there any data shared between tenants?
  - Only the global catalogs: `business_types`, `tenant_statuses`, and `booking_statuses`.

- Can the superadmin see a tenant's individual bookings?
  - Not for the MVP.

---

## Reports and audit

- Which metrics matter most for the owner's dashboard?
  - Total bookings today, bookings this month, and most requested services.

- Can reports be filtered by date range or by location?
  - Yes for date range. By location is desirable but not a priority for the MVP.
