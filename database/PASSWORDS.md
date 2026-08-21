# Development credentials

All seed data is synthetic (no real data). Use these credentials only
against the local database.

## Superadmins

All share the same dev password: **Admin123**

Example: `ava.whitfield@citari.admin`

## Business owners

All share the same dev password: **bowner123**

Example: `daniel.whitmore@example.com` (owner of the `copper-blade-barbershop`
tenant, useful for demos).

## Hashing algorithm

bcrypt with 12 rounds (salt auto-generated). Hashes are generated with
Python `bcrypt` and inserted as literals in the seed script
(`database/scripts/citari.sql`).

Hash format: `$2b$12$<salt+hash_base64>`
