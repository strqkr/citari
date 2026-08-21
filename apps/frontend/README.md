# Citari Frontend (Next.js)

Citari's frontend (App Router, React Server Components). Wired to the real
`apps/api` API (auth, full back-office, availability, public
booking/tracking flow). See [docs/frontend-map.md](../../docs/frontend-map.md)
for the route <-> endpoint map.

## Getting started (recommended: Docker)

From the repo root:

```bash
docker compose up --build
```

Brings up `db` + `api` + this frontend in development mode with **real hot
reload** (bind mount + `next dev --webpack`, with polling so it works over
Windows/Docker Desktop bind mounts): save a file and the change shows up on
its own, no rebuild needed. `NEXT_PUBLIC_API_MODE=api` is already set by
default in compose, pointing at the stack's real API.

Frontend at http://localhost:3000.

## Getting started (without Docker, on the host)

```bash
cd apps/frontend
corepack enable        # activates the pnpm pinned in package.json (packageManager)
pnpm install
pnpm dev
```

Create `apps/frontend/.env.local` (gitignored) to point at a real API
instead of mock data:

```bash
NEXT_PUBLIC_API_MODE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

- `mock` (default if `.env.local` isn't set): doesn't hit the real backend,
  uses fake data from `lib/mock-data.ts`. Useful for working on design only.
- `api`: real HTTP traffic against `apps/api`.

## Production

See [docs/deployment.md](../../docs/deployment.md): the production Docker
image (`Dockerfile`, multi-stage, Next.js `standalone`) and the GitHub
Actions workflow that publishes it to GHCR. `NEXT_PUBLIC_*` variables are
baked into the bundle **at build time**, not at runtime.

## Key structure

- `app/`: App Router routes (public, business owner, superadmin).
- `components/ui/`: shadcn/ui primitives (button, card, table, calendar, sidebar, ...).
- `components/admin/`, `components/booking/`, `components/marketing/`: managers and screens per domain.
- `lib/endpoints.ts`: map of API endpoints.
- `lib/api.ts`: HTTP client (picks the browser URL or the internal Docker one based on `typeof window`).
- `lib/resource.ts`: `useResource`/`useResourceOne` hook with mock fallback and loading/error states.
- `lib/mock-data.ts`: fake data for `NEXT_PUBLIC_API_MODE=mock`.
- `hooks/useAuth.ts`: session rehydration (owner/superadmin) via `GET /auth/me`.
- `types/`: TS contracts aligned with the API schemas.

## Implemented routes

- **Public**: `/`, `/track`, `/book/[slug]/*`, `/track/[code]/*`
- **Business owner**: `/login`, `/register`, `/dashboard`, `/services`, `/service-categories`,
  `/locations`, `/availability` (weekly hours + slot generation, a single flow),
  `/bookings`, `/customers`, `/reports`, `/settings/business`
- **Superadmin**: `/admin/login`, `/admin/tenants`, `/admin/tenants/[id]`

## Scripts

```bash
pnpm dev      # development server
pnpm build    # production build (generates .next/standalone)
pnpm start    # serves the production build
pnpm lint     # eslint
```

## Package manager

- `pnpm`, version pinned in `packageManager` (package.json) so `corepack` is
  deterministic both locally and in CI/Docker. Avoid `npm`/`yarn` to prevent
  mixing lockfiles.
