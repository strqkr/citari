# Citari Frontend (Next.js)

Citari's frontend uses the Next.js App Router and is wired exclusively to the
PostgreSQL/Prisma API in `apps/api-next`: authentication, back-office,
availability, public booking, and customer tracking all use real HTTP data.

## Getting started (recommended: Docker)

From the repo root:

```bash
docker compose up --build
```

Brings up PostgreSQL, the API, and this frontend. No demo records are created;
bootstrap the first superadmin explicitly as documented in the root README.

Frontend at http://localhost:3000.

## Getting started (without Docker, on the host)

```bash
cd apps/frontend
corepack enable        # activates the pnpm pinned in package.json (packageManager)
pnpm install
pnpm dev
```

Create `apps/frontend/.env.local` (gitignored) when the API is not listening
on the default `http://localhost:8000` address:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

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
- `lib/resource.ts`: `useResource`/`useResourceOne` hooks with loading, retry,
  and production error states.
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
