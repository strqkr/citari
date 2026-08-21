# Visual architecture: how everything connects

> Quick guide for any developer on the team. Diagrams render automatically on
> GitHub. Detailed API reference in [api-handover.md](api-handover.md).

## 1. The whole map at a glance

Three containers orchestrated by `docker compose up --build`:

```mermaid
flowchart LR
    subgraph Browser
        B[User's browser]
    end

    subgraph frontend [frontend :3000]
        N[Next.js App Router]
        A[lib/api.ts<br/>apiGet / apiPost / apiPatch / apiDelete]
    end

    subgraph api [api :8000]
        R[Routers /api/v1<br/>HTTP only]
        S[Services<br/>orchestration]
        P[Repositories<br/>only layer that touches SQL]
    end

    subgraph db [sqlserver :1433]
        SP[13 stored procedures]
        VW[7 views]
        TR[7 triggers<br/>tracking, audit,<br/>freeing blocks]
        T[(24 tables)]
    end

    B --> N
    N --> A
    A -- "camelCase JSON<br/>Authorization: Bearer" --> R
    R --> S --> P
    P -- pyodbc --> SP
    P -- pyodbc --> VW
    SP --> T
    VW --> T
    T -. fire .-> TR
```

Golden rules:

| Rule | What it means |
|---|---|
| The frontend's UI is Spanish | The user-facing text (labels, messages) — the product's market |
| The schema and API are both English | Tables/columns (`services`, `name`), JSON is camelCase (`serviceId`, `firstName`) |
| The API translates casing | Mappers convert snake_case -> camelCase, in exactly one place |
| Business logic lives in SQL | Writes go through stored procedures, reads go through views |
| Triggers do the magic automatically | Tracking codes, audit logging, and freeing blocks are AUTOMATIC: never reimplement them in the API or frontend |

## 2. What's on which port

| URL | What's there |
|---|---|
| http://localhost:3000 | Next.js frontend |
| http://localhost:8000/api/v1/... | API (every endpoint) |
| http://localhost:8000/docs | Interactive OpenAPI docs (try endpoints without the frontend) |
| localhost:11433 | SQL Server (DBeaver/Azure Data Studio, credentials in `.env`) |

## 3. JWT in 3 steps (how login works)

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend (lib/api.ts)
    participant API as API (/api/v1)
    participant DB as SQL Server

    Note over U,DB: STEP 1 - Login
    U->>F: types email + password
    F->>API: POST /auth/login {email, password}
    API->>DB: looks up by email, verifies bcrypt hash
    DB-->>API: valid user (owner of tenant 1)
    API-->>F: { accessToken: "eyJ...", user: {...} }
    F->>F: setAuthToken(token)  // localStorage "citari_token"

    Note over U,DB: STEP 2 - Any private request
    F->>API: GET /bookings + header Authorization: Bearer eyJ...
    API->>API: CurrentOwner guard decodes the token<br/>and pulls tenantId FROM THE TOKEN (never from the request)
    API->>DB: v_booking_details WHERE tenant_id = 1
    DB-->>API: only tenant 1's bookings
    API-->>F: { items: [...], total, page, pageSize }

    Note over U,DB: STEP 3 - Logout
    F->>F: clearAuthToken()  // token is cleared, done
```

Three claims travel inside the token: `sub` (user id), `role` (`owner` or
`superadmin`), and `tenantId` (owners only). Expires in 60 minutes; on expiry
the API returns 401 and the frontend should redirect to login.

## 4. How to use it from frontend code

Already fully implemented in `apps/frontend/lib/api.ts`. Usage:

```ts
// LOGIN (once): stores the token
import { apiPost, setAuthToken } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

const res = await apiPost<LoginResponse>(endpoints.auth.login, {
  email, password, role: "owner",
});
setAuthToken(res.accessToken);   // ends up in localStorage "citari_token"
```

```ts
// ANY PRIVATE CALL after login:
// the Authorization: Bearer header is added ONLY if a token is stored
import { apiGet, apiPost } from "@/lib/api";

const page = await apiGet<Page<Booking>>("/bookings?page=1&pageSize=20");
const created = await apiPost<Service>("/services", {
  categoryId: 1, name: "Premium haircut", durationMinutes: 45,
});
```

```ts
// ERRORS: the API responds RFC 7807 and api.ts converts it to ApiError
try {
  await apiPost("/public/copper-blade-barbershop/bookings", body);
} catch (e) {
  if (e instanceof ApiError && e.status === 409) {
    // someone else already booked that block
    showMessage(e.detail);
  }
}
```

```ts
// LOGOUT
import { clearAuthToken } from "@/lib/api";
clearAuthToken();
router.push("/login");
```

## 5. Public vs. private: who needs a token

```mermaid
flowchart TD
    Q{The screen is...}
    Q -->|"booking or checking<br/>(end customer)"| PUB[NO token<br/>/public/slug/...<br/>/track/code/...]
    Q -->|"business back-office<br/>(owner)"| OWN[Token role=owner<br/>/services /bookings /customers<br/>/reports /tenant/current ...]
    Q -->|"platform administration"| ADM[Token role=superadmin<br/>/admin/tenants /audit-logs]
```

- The public booking flow never asks for login: the customer gets a
  **tracking code** (`CITARI-XXXXXX`, generated by a trigger) and uses it to
  check/cancel/reschedule.
- An owner only ever sees THEIR tenant: `tenantId` comes from the token, so
  it's impossible to request another business's data (the API returns 404).

## 6. Recipe: wiring up a new screen in 5 steps

1. Find the endpoint in [api-handover.md](api-handover.md) or at http://localhost:8000/docs.
2. If the TS type doesn't exist yet, add it in `apps/frontend/types/` (camelCase, matching the JSON).
3. Call it with the `lib/api.ts` helpers (`apiGet`/`apiPost`/...) using the constant from `lib/endpoints.ts`.
4. If the screen is private, no special handling needed: the Bearer header is added automatically when a token exists; handle 401 by redirecting to login.
5. Listings are paginated: read `res.items` and `res.total` (don't assume a flat array).

## 7. Bringing everything up from scratch (2 commands)

```bash
cp .env.example .env          # and generate JWT_SECRET: openssl rand -hex 32
bash scripts/setup-db.sh      # SQL Server + 24 tables + seed + SPs + views + triggers
docker compose up --build     # API :8000 + frontend :3000
```

Test credentials in `database/docs/PASSWORDS.md`. Demo tenant: `copper-blade-barbershop`.
