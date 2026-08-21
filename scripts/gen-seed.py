#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen-seed.py - Deterministic generator for database/scripts/03-seed-data.sql.

Emits a small, realistic demo dataset against the English-named schema
(database/scripts/02-create-tables.sql). No randomness and no
datetime.now(): every date derives from the literal constant ANCHOR_DATE,
so two runs produce byte-identical output.

This is intentionally NOT padded to a fixed row count per table. It is a
handful of tenants with owners, locations, services, customers, and
bookings in varied states - enough for the running app to look genuinely
used, not an artificial quota of rows.

Usage:
    python3 scripts/gen-seed.py            writes database/scripts/03-seed-data.sql
    python3 scripts/gen-seed.py --check    regenerates to a temp file and compares
                                            it byte-for-byte against the committed
                                            file. Prints OK/FAIL and exits 0/1.
"""

import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "database" / "scripts" / "03-seed-data.sql"

# Anchor date literal: every date in the seed derives from this constant.
# Chosen a few weeks out from "today" so availability blocks and bookings
# read as near-future, not stale.
ANCHOR_DATE = date(2026, 9, 1)

# Literal bcrypt hashes already used by the team (dev test data, not secrets).
# HASH_SUPERADMIN is bcrypt("Admin123"), HASH_OWNER is bcrypt("bowner123").
# Documented in database/docs/PASSWORDS.md - keep both in sync if these change.
HASH_SUPERADMIN = "$2b$12$HNf7oIJgipKcyCIEJLR1POaKhc46Oh//2IJ7eNtn/Mu5wvNC98qFe"
HASH_OWNER = "$2b$12$6B3wIs./ish6IGqLCScHCet1uryH9qoa9WPGGqEzBVa47GL7kJHPe"

# ---------------------------------------------------------------------------
# Constant data
# ---------------------------------------------------------------------------

# business_types: (name, description) - a realistic but short catalog of
# verticals the platform supports, not padding.
BUSINESS_TYPES = [
    ("Barbershop", "Haircuts and grooming for men"),
    ("Hair Salon", "Hairstyling and beauty services"),
    ("Spa", "Relaxation and wellness treatments"),
    ("Veterinary Clinic", "Health services for pets"),
    ("Medical Clinic", "General medical care"),
    ("Dental Clinic", "Dental services"),
    ("Wellness Center", "Holistic and alternative therapies"),
    ("Gym", "Fitness and strength training"),
    ("Massage Therapy", "Therapeutic massage"),
    ("Nutrition Counseling", "Dietary and nutrition consulting"),
    ("Physical Therapy", "Rehabilitation and physiotherapy"),
    ("Nail Salon", "Manicure and pedicure services"),
    ("Tattoo Studio", "Tattoo and body art"),
    ("Yoga Studio", "Yoga classes"),
    ("Psychology Practice", "Mental health counseling"),
]

# tenant_statuses: (name, description) - the complete real catalog, 4 rows.
TENANT_STATUSES = [
    ("pending", "Pending approval"),
    ("active", "Active and operating"),
    ("suspended", "Suspended by an administrator"),
    ("inactive", "Inactive or deregistered"),
]

# booking_statuses: (name, description) - the complete real catalog, 5 rows.
BOOKING_STATUSES = [
    ("pending", "Booking pending confirmation"),
    ("confirmed", "Booking confirmed"),
    ("cancelled", "Booking cancelled"),
    ("completed", "Booking completed"),
    ("rescheduled", "Booking rescheduled"),
]
BOOKING_STATUS_ID = {name: i for i, (name, _) in enumerate(BOOKING_STATUSES, start=1)}

# superadmins: (first_name, last_name_1, last_name_2, email) - synthetic demo people.
SUPERADMINS = [
    ("Ava", "Whitfield", None, "ava.whitfield@citari.admin"),
    ("Noah", "Sinclair", "Reyes", "noah.sinclair@citari.admin"),
]

# tenants: (business_type_id, name, slug, email, phone, description, public_message)
# tenant_status_id is "active" (2) for every seed tenant.
TENANTS = [
    (
        1,
        "Copper & Blade Barbershop",
        "copper-blade-barbershop",
        "info@copperandblade.example",
        "2201-1001",
        "Classic barbershop offering cuts, shaves, and beard trims.",
        "Walk-ins welcome, but booking ahead saves you the wait.",
    ),
    (
        3,
        "Serene Springs Spa",
        "serene-springs-spa",
        "hello@serenespringsspa.example",
        "2201-1002",
        "Full-service spa focused on massage and facial treatments.",
        "Your escape from the everyday, one treatment at a time.",
    ),
    (
        4,
        "Willowbrook Veterinary Clinic",
        "willowbrook-veterinary",
        "care@willowbrookvet.example",
        "2201-1003",
        "Veterinary clinic providing checkups and preventive care for pets.",
        "Caring for your pets like they're our own.",
    ),
]

# tenant_owners: (tenant_id, first_name, last_name_1, last_name_2, email, phone)
OWNERS = [
    (1, "Daniel", "Whitmore", None, "daniel.whitmore@example.com", "8801-2001"),
    (2, "Priya", "Anand", "Marchetti", "priya.anand@example.com", "8801-2002"),
    (3, "Marcus", "Ellery", None, "marcus.ellery@example.com", "8801-2003"),
]

# customers: (tenant_id, first_name, last_name_1, last_name_2, email, phone, notes)
CUSTOMERS = [
    (1, "John", "Carver", None, "john.carver@example.com", "8801-3001", "Regular - prefers Saturdays"),
    (1, "Maria", "Lopez", "Bennett", "maria.lopez@example.com", "8801-3002", None),
    (1, "Ben", "Turner", None, "ben.turner@example.com", "8801-3003", "Always asks for the same barber"),
    (2, "Elena", "Petrova", None, "elena.petrova@example.com", "8801-3004", "Allergic to strong fragrances"),
    (2, "Sam", "Okafor", "Diallo", "sam.okafor@example.com", "8801-3005", None),
    (3, "Grace", "Kim", None, "grace.kim@example.com", "8801-3006", "Has a nervous rescue dog - handle gently"),
    (3, "Tomas", "Nowak", None, "tomas.nowak@example.com", "8801-3007", None),
    (3, "Lucia", "Fernandez", "Ibarra", "lucia.fernandez@example.com", "8801-3008", "Cat is due for vaccines"),
]

# service_categories: (tenant_id, name, description)
SERVICE_CATEGORIES = [
    (1, "Haircuts", "Haircut services"),
    (1, "Beard & Shave", "Beard trims and traditional shaves"),
    (2, "Massage", "Massage therapy"),
    (2, "Facial Treatments", "Skin care and facials"),
    (3, "Wellness Checkups", "Routine health checkups"),
    (3, "Vaccinations", "Preventive vaccination packages"),
]

# services: (tenant_id, category_id, name, duration_minutes, price)
SERVICES = [
    (1, 1, "Classic Haircut", 30, 15.00),
    (1, 1, "Buzz Cut", 20, 10.00),
    (1, 2, "Beard Trim", 15, 8.00),
    (2, 3, "Swedish Massage", 60, 70.00),
    (2, 3, "Deep Tissue Massage", 60, 85.00),
    (2, 4, "Hydrating Facial", 45, 60.00),
    (3, 5, "Annual Checkup", 30, 45.00),
    (3, 5, "Dental Cleaning", 45, 65.00),
    (3, 6, "Core Vaccine Package", 20, 35.00),
]

# addresses: (province, canton, district, postal_code) - Costa Rican
# geography used as demo data, one per location below.
ADDRESSES = [
    ("San Jose", "San Jose", "Carmen", "10101"),
    ("San Jose", "Escazu", "San Rafael", "10203"),
    ("Heredia", "Heredia", "Mercedes", "40101"),
    ("Alajuela", "Alajuela", "San Jose", "20101"),
]

# locations: (tenant_id, address_id, name, is_main)
LOCATIONS = [
    (1, 1, "Downtown Branch", True),
    (1, 2, "Uptown Branch", False),
    (2, 3, "Main Spa", True),
    (3, 4, "Main Clinic", True),
]
LOCATION_PHONES = ["2256-5501", "2256-5502", "2256-5503", "2256-5504"]

# Business hours per location: day 0 = Sunday .. 6 = Saturday.
# (closed_days, open_hour, close_hour) - the same weekly pattern applies to
# every day the location is open.
LOCATION_HOURS = {
    1: ({0}, 9, 19),   # barbershop downtown: Mon-Sat 09:00-19:00, closed Sunday
    2: ({0}, 9, 19),   # barbershop uptown: same pattern
    3: ({1}, 10, 20),  # spa: Tue-Sun 10:00-20:00, closed Monday
    4: ({0}, 8, 17),   # vet clinic: Mon-Sat 08:00-17:00, closed Sunday
}

# availability_blocks: (location_id, day_offset_from_anchor, start_hour,
# start_minute, duration_minutes). day_offset is relative to ANCHOR_DATE.
AVAILABILITY_BLOCKS = [
    (1, 2, 9, 0, 30),    # 1  - Classic Haircut slot
    (1, 2, 10, 0, 20),   # 2  - Buzz Cut slot
    (1, 3, 9, 0, 15),    # 3  - Beard Trim slot
    (1, 3, 11, 0, 30),   # 4  - Classic Haircut slot
    (2, 4, 9, 0, 20),    # 5  - Buzz Cut slot, uptown
    (2, 5, 10, 0, 15),   # 6  - Beard Trim slot, uptown (stays open)
    (3, 2, 9, 0, 60),    # 7  - Swedish Massage slot
    (3, 3, 11, 0, 60),   # 8  - Deep Tissue Massage slot
    (3, 4, 9, 0, 45),    # 9  - Hydrating Facial slot
    (3, 5, 14, 0, 60),   # 10 - Swedish Massage slot (stays open)
    (4, 2, 9, 0, 30),    # 11 - Annual Checkup slot
    (4, 3, 10, 0, 45),   # 12 - Dental Cleaning slot
    (4, 4, 9, 0, 20),    # 13 - Core Vaccine Package slot (stays open)
    (4, 5, 11, 0, 30),   # 14 - Annual Checkup slot (stays open)
    (1, 6, 9, 0, 30),    # 15 - Classic Haircut slot (stays open)
    (3, 7, 9, 0, 60),    # 16 - Swedish Massage slot (stays open)
]

# bookings: (tenant_id, customer_id, service_id, location_id,
# availability_block_id, status_name, customer_notes, internal_notes)
# start_time/end_time are taken directly from the referenced block.
BOOKINGS = [
    (1, 1, 1, 1, 1, "confirmed", "Morning works best for me", None),
    (1, 2, 2, 1, 2, "completed", None, None),
    (1, 3, 3, 1, 3, "pending", "First time getting a beard trim here", None),
    (1, 1, 1, 1, 4, "cancelled", "Something came up, sorry", "Customer called ahead to cancel"),
    (1, 2, 2, 2, 5, "confirmed", None, None),
    (2, 4, 4, 3, 7, "confirmed", "Please use unscented oil", None),
    (2, 5, 5, 3, 8, "pending", None, None),
    (2, 4, 6, 3, 9, "completed", None, "Repeat client, very happy with results"),
    (3, 6, 7, 4, 11, "confirmed", "Dog gets anxious, please be patient", None),
    (3, 7, 8, 4, 12, "cancelled", "Rescheduling for next month", "Freed up the slot per client request"),
]

# audit_logs: (tenant_id, owner_id, superadmin_id, action, entity_name,
# entity_id, old_value, new_value)
AUDIT_LOGS = [
    (1, 1, None, "tenant_created", "tenants", 1, None, "Tenant created: Copper & Blade Barbershop"),
    (2, 2, None, "tenant_created", "tenants", 2, None, "Tenant created: Serene Springs Spa"),
    (3, 3, None, "tenant_created", "tenants", 3, None, "Tenant created: Willowbrook Veterinary Clinic"),
    (1, 1, None, "booking_confirmed", "bookings", 1, "pending", "confirmed"),
    (2, 2, None, "booking_confirmed", "bookings", 6, "pending", "confirmed"),
    (3, None, 1, "booking_cancelled", "bookings", 10, "pending", "cancelled"),
]

# Alphabet without ambiguous characters, for deterministic tracking codes.
TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"

# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------


def sql_escape(value):
    """Escape apostrophes for T-SQL N'...' literals."""
    return value.replace("'", "''")


def qs(value):
    """String -> NVARCHAR literal (or NULL)."""
    if value is None:
        return "NULL"
    return "N'" + sql_escape(value) + "'"


def qdate(d):
    return "'" + d.isoformat() + "'"


def qdt(x):
    return "'" + x.strftime("%Y-%m-%dT%H:%M:%S") + "'"


def qtime(hh, mm):
    return "'{:02d}:{:02d}'".format(hh, mm)


def qbit(b):
    return "1" if b else "0"


def qmoney(n):
    return "{:.2f}".format(n)


def emit_insert(lines, table, cols, rows):
    """Emit a multi-row INSERT plus a uniform progress PRINT."""
    lines.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES")
    for j, row in enumerate(rows):
        end = "," if j < len(rows) - 1 else ";"
        lines.append("    (" + ", ".join(row) + ")" + end)
    lines.append(f"PRINT '[03-seed-data] table {table} ... OK';")
    lines.append("GO")
    lines.append("")


# ---------------------------------------------------------------------------
# Deterministic derivations (dates, blocks, tracking codes)
# ---------------------------------------------------------------------------


def block_datetimes(day_offset, start_hour, start_minute, duration_minutes):
    block_date = ANCHOR_DATE + timedelta(days=day_offset)
    start = datetime(block_date.year, block_date.month, block_date.day, start_hour, start_minute)
    end = start + timedelta(minutes=duration_minutes)
    return block_date, start, end


def tracking_code(i):
    a = TRACKING_ALPHABET[(i * 5) % len(TRACKING_ALPHABET)]
    b = TRACKING_ALPHABET[(i * 11) % len(TRACKING_ALPHABET)]
    c = TRACKING_ALPHABET[(i * 17) % len(TRACKING_ALPHABET)]
    return f"CITARI-{a}{b}{c}{i:02d}"


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


def build_sql():
    lines = []
    lines.append("-- 03-seed-data.sql")
    lines.append("-- Project: Citari")
    lines.append("-- Content: a small, realistic demo dataset (not padded to a row quota).")
    lines.append("-- Requires a freshly created database: IDENTITY ids start at 1 and")
    lines.append("-- foreign keys are emitted as literal ids matching insertion order.")
    lines.append("")
    lines.append("USE citari;")
    lines.append("GO")
    lines.append("")
    lines.append("SET NOCOUNT ON;")
    lines.append("GO")
    lines.append("")

    # -- business_types -------------------------------------------------
    rows = [[qs(n), qs(d), "1"] for (n, d) in BUSINESS_TYPES]
    emit_insert(lines, "business_types", ["name", "description", "is_active"], rows)

    # -- tenant_statuses --------------------------------------------------
    rows = [[qs(n), qs(d)] for (n, d) in TENANT_STATUSES]
    emit_insert(lines, "tenant_statuses", ["name", "description"], rows)

    # -- booking_statuses -------------------------------------------------
    rows = [[qs(n), qs(d)] for (n, d) in BOOKING_STATUSES]
    emit_insert(lines, "booking_statuses", ["name", "description"], rows)

    # -- superadmins (email lives separately: 1NF) -------------------------
    rows = [[qs(fn), qs(l1), qs(l2), qs(HASH_SUPERADMIN), "1"] for (fn, l1, l2, _) in SUPERADMINS]
    emit_insert(
        lines, "superadmins",
        ["first_name", "last_name_1", "last_name_2", "password_hash", "is_active"],
        rows,
    )

    # -- superadmin_emails (email i -> superadmin i, 1NF) ------------------
    rows = [[str(i), qs(email)] for i, (_, _, _, email) in enumerate(SUPERADMINS, start=1)]
    emit_insert(lines, "superadmin_emails", ["superadmin_id", "email"], rows)

    # -- tenants (status "active" = 2; email/phone live separately) --------
    rows = []
    for (btype, name, slug, _, _, desc, msg) in TENANTS:
        rows.append([str(btype), "2", qs(name), qs(slug), qs(desc), "NULL", qs(msg), "1"])
    emit_insert(
        lines, "tenants",
        ["business_type_id", "tenant_status_id", "name", "slug",
         "description", "logo_url", "public_message", "is_active"],
        rows,
    )

    # -- tenant_emails / tenant_phones (1:N per tenant, 1NF) ---------------
    rows = [[str(i), qs(email)] for i, (_, _, _, email, _, _, _) in enumerate(TENANTS, start=1)]
    emit_insert(lines, "tenant_emails", ["tenant_id", "email"], rows)

    rows = [[str(i), qs(phone)] for i, (_, _, _, _, phone, _, _) in enumerate(TENANTS, start=1)]
    emit_insert(lines, "tenant_phones", ["tenant_id", "phone"], rows)

    # -- tenant_owners (one owner per tenant; email/phone live separately) -
    rows = []
    for (tenant_id, fn, l1, l2, _, _) in OWNERS:
        rows.append([str(tenant_id), qs(fn), qs(l1), qs(l2), qs(HASH_OWNER), "1"])
    emit_insert(
        lines, "tenant_owners",
        ["tenant_id", "first_name", "last_name_1", "last_name_2", "password_hash", "is_active"],
        rows,
    )

    # -- owner_emails / owner_phones (1:N per owner, 1NF) -------------------
    rows = [[str(i), qs(email)] for i, (_, _, _, _, email, _) in enumerate(OWNERS, start=1)]
    emit_insert(lines, "owner_emails", ["owner_id", "email"], rows)

    rows = [[str(i), qs(phone)] for i, (_, _, _, _, _, phone) in enumerate(OWNERS, start=1)]
    emit_insert(lines, "owner_phones", ["owner_id", "phone"], rows)

    # -- customers (email/phone live separately) ----------------------------
    rows = []
    for (tenant_id, fn, l1, l2, _, _, notes) in CUSTOMERS:
        rows.append([str(tenant_id), qs(fn), qs(l1), qs(l2), qs(notes)])
    emit_insert(
        lines, "customers",
        ["tenant_id", "first_name", "last_name_1", "last_name_2", "notes"],
        rows,
    )

    # -- customer_emails / customer_phones (1:N per customer, 1NF) ---------
    rows = [[str(i), qs(email)] for i, (_, _, _, _, email, _, _) in enumerate(CUSTOMERS, start=1)]
    emit_insert(lines, "customer_emails", ["customer_id", "email"], rows)

    rows = [[str(i), qs(phone)] for i, (_, _, _, _, _, phone, _) in enumerate(CUSTOMERS, start=1)]
    emit_insert(lines, "customer_phones", ["customer_id", "phone"], rows)

    # -- service_categories ---------------------------------------------------
    rows = []
    for (tenant_id, name, desc) in SERVICE_CATEGORIES:
        rows.append([str(tenant_id), qs(name), qs(desc), "1"])
    emit_insert(
        lines, "service_categories",
        ["tenant_id", "name", "description", "is_active"],
        rows,
    )

    # -- services ---------------------------------------------------------
    rows = []
    for (tenant_id, category_id, name, duration, price) in SERVICES:
        rows.append([str(tenant_id), str(category_id), qs(name), qs(f"{name} service"),
                     str(duration), qmoney(price), "1", "1"])
    emit_insert(
        lines, "services",
        ["tenant_id", "category_id", "name", "description",
         "duration_minutes", "price", "show_price", "is_active"],
        rows,
    )

    # -- addresses (territorial catalog, one per location below) -----------
    rows = [[qs(province), qs(canton), qs(district), qs(postal)] for (province, canton, district, postal) in ADDRESSES]
    emit_insert(lines, "addresses", ["province", "canton", "district", "postal_code"], rows)

    # -- locations ----------------------------------------------------------
    rows = []
    for (tenant_id, address_id, name, is_main) in LOCATIONS:
        rows.append([str(tenant_id), str(address_id), qs(name), qbit(is_main), "1"])
    emit_insert(
        lines, "locations",
        ["tenant_id", "address_id", "name", "is_main", "is_active"],
        rows,
    )

    # -- location_phones (1:N per location, 1NF) -----------------------------
    rows = [[str(i), qs(phone)] for i, phone in enumerate(LOCATION_PHONES, start=1)]
    emit_insert(lines, "location_phones", ["location_id", "phone"], rows)

    # -- business_hours (one row per day of week per location) --------------
    rows = []
    for location_id, (tenant_id, _, _, _) in enumerate(LOCATIONS, start=1):
        closed_days, open_hour, close_hour = LOCATION_HOURS[location_id]
        for day in range(7):
            if day in closed_days:
                rows.append([str(tenant_id), str(location_id), str(day), "NULL", "NULL", "1"])
            else:
                rows.append([str(tenant_id), str(location_id), str(day),
                             qtime(open_hour, 0), qtime(close_hour, 0), "0"])
    emit_insert(
        lines, "business_hours",
        ["tenant_id", "location_id", "day_of_week", "open_time", "close_time", "is_closed"],
        rows,
    )

    # -- availability_blocks --------------------------------------------------
    rows = []
    block_cache = {}
    for i, (location_id, day_offset, sh, sm, dur) in enumerate(AVAILABILITY_BLOCKS, start=1):
        tenant_id = LOCATIONS[location_id - 1][0]
        block_date, start, end = block_datetimes(day_offset, sh, sm, dur)
        block_cache[i] = (block_date, start, end)
        rows.append([str(tenant_id), str(location_id), qdate(block_date), qdt(start), qdt(end), "1"])
    emit_insert(
        lines, "availability_blocks",
        ["tenant_id", "location_id", "block_date", "start_time", "end_time", "is_active"],
        rows,
    )

    # -- bookings (cancelled bookings release their block: availability_block_id
    # -- goes NULL, mirroring what tr_release_block_on_cancel does on UPDATE at
    # -- runtime; this seed inserts directly and doesn't fire that trigger, so it
    # -- must set NULL itself or the filtered unique index would still show the
    # -- block as held) -----------------------------------------------------
    rows = []
    for (tenant_id, customer_id, service_id, location_id, block_id, status_name, cust_notes, internal_notes) in BOOKINGS:
        _, start, end = block_cache[block_id]
        status_id = BOOKING_STATUS_ID[status_name]
        block_ref = "NULL" if status_name == "cancelled" else str(block_id)
        rows.append([str(tenant_id), str(customer_id), str(service_id), str(location_id),
                     block_ref, str(status_id), qdt(start), qdt(end), qs(cust_notes), qs(internal_notes)])
    emit_insert(
        lines, "bookings",
        ["tenant_id", "customer_id", "service_id", "location_id",
         "availability_block_id", "booking_status_id",
         "start_time", "end_time", "customer_notes", "internal_notes"],
        rows,
    )

    # -- tracking_codes (one per booking) ------------------------------------
    rows = []
    for i, (_, _, _, _, block_id, _, _, _) in enumerate(BOOKINGS, start=1):
        _, start, _ = block_cache[block_id]
        expires = start + timedelta(days=30)
        rows.append([str(i), qs(tracking_code(i)), qdt(expires), "1"])
    emit_insert(
        lines, "tracking_codes",
        ["booking_id", "tracking_code", "expires_at", "is_active"],
        rows,
    )

    # -- audit_logs -----------------------------------------------------------
    rows = []
    for (tenant_id, owner_id, superadmin_id, action, entity_name, entity_id, old_value, new_value) in AUDIT_LOGS:
        rows.append([
            str(tenant_id) if tenant_id is not None else "NULL",
            str(owner_id) if owner_id is not None else "NULL",
            str(superadmin_id) if superadmin_id is not None else "NULL",
            qs(action), qs(entity_name), str(entity_id), qs(old_value), qs(new_value),
        ])
    emit_insert(
        lines, "audit_logs",
        ["tenant_id", "owner_id", "superadmin_id", "action", "entity_name",
         "entity_id", "old_value", "new_value"],
        rows,
    )

    lines.append("PRINT '[03-seed-data] 24/24 tables populated';")
    lines.append("GO")
    lines.append("")
    return "\n".join(lines)


def main():
    content = build_sql()
    data = content.encode("utf-8-sig")  # UTF-8 with BOM

    if "--check" in sys.argv[1:]:
        tmp = Path(tempfile.gettempdir()) / "gen-seed-check-03-seed-data.sql"
        tmp.write_bytes(data)
        try:
            actual = OUTPUT_PATH.read_bytes()
        except FileNotFoundError:
            print(f"[gen-seed] check {OUTPUT_PATH.name} ... FAIL (file does not exist)")
            sys.exit(1)
        if actual == tmp.read_bytes():
            print(f"[gen-seed] check {OUTPUT_PATH.name} ... OK")
            sys.exit(0)
        print(f"[gen-seed] check {OUTPUT_PATH.name} ... FAIL (differs from generator)")
        sys.exit(1)

    OUTPUT_PATH.write_bytes(data)
    print(f"[gen-seed] generated {OUTPUT_PATH.relative_to(REPO_ROOT)} ... OK")


if __name__ == "__main__":
    main()
