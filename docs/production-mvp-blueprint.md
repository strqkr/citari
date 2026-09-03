# Citari production MVP blueprint

Status: active execution — not approved for production
Owner: `strqkr`
Target: production-ready multi-tenant booking platform  
Last evidence audit: 2026-09-02

## Execution governance

Every numbered item is an independently reviewable deliverable. An item is
complete only when its implementation, automated evidence, operational
documentation, and rollback or recovery behavior are merged into `main`.
Code existing locally, a design proposal, or a passing unit test alone does not
close an item. P0 items are release blockers; P1 items are part of the MVP
unless the go-live review records a named owner, deadline, and accepted risk.

Evidence must be durable and linked from a pull request: tests and scan reports
from CI, migration output, a runbook or ADR, and staging evidence where the
behavior depends on managed infrastructure. The final go-live review audits all
200 items one by one; this document is not itself a production approval.

### Verified baseline on `main`

| Capability | Current evidence | Remaining boundary |
|---|---|---|
| PostgreSQL + Prisma foundation | PostgreSQL 17 Compose/CI service, immutable migrations, Prisma schema, RLS/native constraints, migration runbook | Staging cutover rehearsal, backup/restore and managed-database evidence |
| Runtime architecture | pnpm workspace, NestJS/Fastify API, Next.js BFF, strict configuration, RFC 7807 errors | Contract artifact/versioning and full domain dependency enforcement |
| Production initialization | No seed path; audited idempotent Andrew bootstrap; forced password change, verification and MFA | Managed-secret/bootstrap ceremony in staging and automatic credential removal evidence |
| Identity security | HttpOnly BFF cookies, exact-origin mutation enforcement, rotated hashed refresh tokens, family reuse revocation, verification/reset delivery, throttling | Session inventory and broader privileged step-up coverage |
| Booking integrity | Server availability, immutable buffers, location locks, database exclusions, expiring holds, encrypted idempotent replay, emailed tracking verification | DST/property testing and full policy model |
| Public UX | Explicit location, real availability, hold recovery, nonce confirmation, safe-body verified tracking, differentiated failures | Accessible end-to-end audit and calendar invitations |
| Automated gate | `pnpm quality`, enforced unit coverage, clean PostgreSQL bootstrap/HTTP integration, concurrent booking test, two production image builds | Playwright/axe/visual gates and security/supply-chain scans |
| Git provenance | Reachable history and GitHub contributors limited to `strqkr` and `lunqdd`; no coauthor trailers | Branch protection, signed release and provenance enforcement |

### Next P0 execution order

1. Booking state-machine, timezone/DST and availability-policy completion.
2. OpenAPI contract artifact plus compatibility and Playwright golden paths.
3. Accessibility remediation and automated axe gate for critical journeys.
4. Supply-chain hardening: immutable actions/images, CodeQL, dependency and
   container scanning, SBOM, signed provenance, and protected publishing.
5. Infrastructure, staging promotion, backups/PITR, restore evidence,
   OpenTelemetry, SLOs, alerts, and incident runbooks.
6. Privacy workflows, retention policy, final threat model, and the item-by-item
   go-live review.

## Product decision

Citari will migrate from FastAPI, pyodbc, SQL Server, stored procedures, and
runtime demo data to a TypeScript API built with NestJS, Fastify, Prisma, and
PostgreSQL. The existing `/api/v1` contract remains stable during the migration.
PostgreSQL row-level security (RLS), exclusion constraints, and native indexes
will complement Prisma wherever the ORM cannot express a production invariant.

Production contains no seed users or demo businesses. The first superadmin is
created by an audited, idempotent, one-time bootstrap command. It accepts Andrew
Fuentes and `andrew@euxora.net`, reads the initial credential from a secret
manager or protected prompt, requires email verification, MFA enrollment, and a
password change, and never stores the credential in Git, migrations, images, or
logs.

## Release gates

No production release is allowed until all P0 items are complete, cross-tenant
tests and booking-concurrency tests pass against PostgreSQL, a backup restore is
proven, the production migration and rollback are rehearsed in staging, and the
release image is deployed by immutable digest with observable health checks.

## 200-point MVP backlog

Priority legend: **P0** release blocker, **P1** required MVP, **P2** operational
maturity immediately after the first controlled release.

### 1. Architecture and repository

1. **P0** Record the PostgreSQL, Prisma, NestJS, and Fastify decision in an ADR.
2. **P0** Preserve `/api/v1` contracts during the backend replacement.
3. **P0** Define bounded domains for identity, tenants, catalog, scheduling, bookings, and reporting.
4. **P0** Establish a dependency rule that domain code never imports transport or Prisma internals.
5. **P0** Introduce shared API error, pagination, money, date, and identifier contracts.
6. **P1** Restructure the repository as a pnpm workspace with deterministic tooling.
7. **P1** Add CODEOWNERS for API, web, database, security, and delivery paths.
8. **P1** Add ADR, RFC, issue, incident, and pull-request templates.
9. **P1** Enforce Conventional Commits and generated release notes.
10. **P1** Publish C4 context, container, component, and deployment diagrams.

### 2. PostgreSQL and Prisma foundation

11. **P0** Replace SQL Server with a supported PostgreSQL production version.
12. **P0** Create a normalized Prisma schema with explicit relation and constraint names.
13. **P0** Convert integer identities to stable UUID or bigint identifiers by documented policy.
14. **P0** Store timestamps as `timestamptz` and dates/times with explicit semantics.
15. **P0** Model money as fixed-precision decimals plus ISO currency.
16. **P0** Replace the monolithic SQL script with immutable versioned Prisma migrations.
17. **P0** Add reviewed native SQL migrations for RLS and unsupported constraints.
18. **P0** Prohibit `prisma db push` in every shared and production environment.
19. **P1** Generate Prisma Client deterministically from the lockfile.
20. **P1** Document naming, nullability, cascade, indexing, and migration conventions.

### 3. Tenant isolation and data integrity

21. **P0** Add mandatory `tenant_id` to every tenant-owned record.
22. **P0** Enable and force PostgreSQL RLS on every tenant-owned table.
23. **P0** Set tenant context transactionally for each authenticated request.
24. **P0** Deny access when tenant context is absent instead of falling back globally.
25. **P0** Test every resource against cross-tenant read, write, update, and delete attempts.
26. **P0** Add exclusion constraints preventing overlapping confirmed slot reservations.
27. **P0** Add unique constraints scoped correctly by tenant.
28. **P0** Enforce legal booking state transitions transactionally.
29. **P1** Add optimistic concurrency versions to frequently edited aggregates.
30. **P1** Add database invariants for durations, price ranges, dates, and contact normalization.

### 4. Migration and cutover

31. **P0** Inventory every SQL Server table, view, procedure, function, trigger, and error code.
32. **P0** Map every legacy object to Prisma, domain logic, native SQL, or intentional removal.
33. **P0** Build a repeatable SQL Server-to-PostgreSQL extraction and transformation tool.
34. **P0** Preserve source identifiers in a private migration mapping table.
35. **P0** Validate row counts, foreign keys, checksums, nulls, and business totals after import.
36. **P0** Rehearse migration on a production-shaped sanitized snapshot.
37. **P0** Define maintenance-window and dual-write decisions explicitly.
38. **P0** Produce an application and database rollback plan with decision deadlines.
39. **P0** Take and verify a recoverable pre-cutover backup.
40. **P1** Produce a signed cutover report and archive migration evidence.

### 5. Production initialization

41. **P0** Delete demo seed execution from all runtime and deployment paths.
42. **P0** Remove documented demo passwords and known secret defaults.
43. **P0** Create an idempotent one-time superadmin bootstrap command.
44. **P0** Bootstrap Andrew Fuentes using `andrew@euxora.net` only from protected input.
45. **P0** Require verified email before superadmin access.
46. **P0** Require MFA enrollment during first superadmin session.
47. **P0** Require an immediate initial password change.
48. **P0** Audit bootstrap execution without logging credentials or tokens.
49. **P1** Disable the bootstrap path automatically after successful initialization.
50. **P1** Provide test factories that never run in production builds.

### 6. API platform

51. **P0** Build NestJS on Fastify with graceful startup and shutdown.
52. **P0** Add typed configuration validation that fails fast in production.
53. **P0** Implement Prisma connection lifecycle, pooling, and timeout policy.
54. **P0** Preserve RFC 7807-compatible error envelopes and trace identifiers.
55. **P0** Generate a versioned OpenAPI document in CI.
56. **P0** Reject unknown request fields and validate all payloads at the boundary.
57. **P0** Add request body, header, URL, and upload size limits.
58. **P1** Standardize cursor pagination, filtering, searching, and stable sorting.
59. **P1** Add idempotency keys to all retriable creation commands.
60. **P1** Add API deprecation headers and a compatibility policy.

### 7. Authentication and authorization

61. **P0** Replace browser `localStorage` JWTs with HttpOnly secure session cookies.
62. **P0** Use short-lived access tokens and rotated, hashed refresh tokens.
63. **P0** Detect refresh-token reuse and revoke the affected session family.
64. **P0** Implement real logout and server-side session revocation.
65. **P0** Enforce role and tenant authorization in centralized guards and policies.
66. **P0** Require MFA for superadmins and privileged owner actions.
67. **P0** Add password reset with single-use expiring tokens.
68. **P0** Add email verification with replay-safe tokens.
69. **P1** Add session inventory, remote logout, and security-event notifications.
70. **P1** Add audited break-glass access with strict expiry and review.

### 8. Security controls

71. **P0** Add rate limits for login, registration, booking, tracking, and recovery.
72. **P0** Add progressive lockout and anti-enumeration responses.
73. **P0** Protect state-changing cookie requests against CSRF.
74. **P0** Deploy CSP, HSTS, frame-ancestors, nosniff, and referrer policies.
75. **P0** Validate or regenerate externally supplied request identifiers.
76. **P0** Redact credentials, tokens, contact data, and notes from logs.
77. **P0** Enforce strict CORS allowlists per environment.
78. **P1** Threat-model authentication, tenant isolation, public booking, and administration.
79. **P1** Add secure file-upload validation, storage isolation, and malware scanning.
80. **P1** Establish vulnerability intake, severity, remediation, and disclosure SLAs.

### 9. Booking and scheduling engine

81. **P0** Calculate availability server-side from service, location, resource, duration, and timezone.
82. **P0** Revalidate every selected slot inside the booking transaction.
83. **P0** Add expiring slot holds with conflict-safe acquisition.
84. **P0** Prevent double booking under concurrent requests at database level.
85. **P0** Make booking creation idempotent across retries and network failures.
86. **P0** Define a tested booking state machine and legal transitions.
87. **P0** Implement atomic bulk availability generation and preview.
88. **P0** Handle DST gaps, overlaps, tenant timezone, and UTC persistence correctly.
89. **P1** Add service buffers, lead times, booking horizons, and cancellation policies.
90. **P1** Add waitlist and next-available suggestions for empty schedules.

### 10. Customer and public flows

91. **P0** Remove all runtime mock fallbacks and fake success behavior.
92. **P0** Fail production builds when API configuration is missing or unsafe.
93. **P0** Stop trusting confirmation data supplied through query strings.
94. **P0** Use a server-issued result nonce for booking confirmation pages.
95. **P0** Require secondary verification for tracking, cancellation, and rescheduling.
96. **P0** Distinguish 404, 409, 410, 422, 429, offline, and server failures.
97. **P1** Show a persistent booking summary before final confirmation.
98. **P1** Make location selection explicit and invalidate incompatible slot choices.
99. **P1** Provide accessible recovery paths for expired holds and conflicts.
100. **P1** Generate timezone-correct ICS calendar invitations after confirmation.

### 11. Owner product experience

101. **P1** Build a resumable onboarding flow from business profile to publication.
102. **P1** Add a production-readiness checklist to the owner dashboard.
103. **P1** Replace fabricated dashboard slices with dedicated aggregate endpoints.
104. **P1** Add server-side search, filters, sorting, and pagination for bookings.
105. **P1** Add day, week, and accessible list calendar views.
106. **P1** Add complete booking detail with timeline and authorized actions.
107. **P1** Add customer profiles, history, consent, export, and deletion requests.
108. **P1** Add service duration, buffer, currency, location, visibility, and ordering controls.
109. **P1** Add safe tenant branding upload with crop, limits, and alt text.
110. **P1** Show suspended and maintenance states with clear remediation.

### 12. Superadmin product experience

111. **P0** Separate superadmin navigation and permissions from owner navigation.
112. **P0** Audit every privileged action with actor, target, reason, and outcome.
113. **P0** Require step-up authentication for destructive tenant actions.
114. **P1** Add tenant status, health, plan, usage, and risk overview.
115. **P1** Implement explicit, time-limited, bannered, and audited impersonation.
116. **P1** Add reason capture and confirmation for suspension and reactivation.
117. **P1** Add support tooling without exposing unnecessary customer PII.
118. **P1** Add immutable security-event and administrative audit views.
119. **P2** Add tenant data export and deletion workflow supervision.
120. **P2** Add operational announcements and scoped maintenance controls.

### 13. Design system and accessibility

121. **P0** Consolidate to one semantic token and component system.
122. **P0** Replace the custom modal with an accessible dialog primitive.
123. **P0** Meet WCAG 2.2 AA for critical public and authenticated flows.
124. **P0** Support keyboard navigation, focus restoration, and skip links.
125. **P0** Announce errors, progress, conflicts, and success through live regions.
126. **P1** Define loading, refreshing, empty, error, offline, forbidden, and success states.
127. **P1** Make tables semantic, sortable, captioned, and responsive.
128. **P1** Guarantee 44px touch targets and non-hover access to every action.
129. **P1** Support reduced motion, 200–400% zoom, and high contrast.
130. **P1** Document components and interaction states in Storybook.

### 14. Frontend architecture

131. **P0** Organize App Router route groups by marketing, auth, booking, owner, and superadmin.
132. **P0** Enforce protected layouts and guards server-side before content renders.
133. **P0** Implement a BFF boundary for secure session handling.
134. **P1** Use TanStack Query for server state and disciplined invalidation.
135. **P1** Use React Hook Form and Zod for accessible typed forms.
136. **P1** Generate frontend contracts from the committed OpenAPI specification.
137. **P1** Pin Next.js, React, ESLint, and their type packages to compatible versions.
138. **P1** Remove legacy CSS collisions and restore predictable normalization.
139. **P1** Add feature flags with ownership, expiry, and cleanup rules.
140. **P1** Add error boundaries with retry, trace ID, and safe telemetry.

### 15. Internationalization and performance

141. **P0** Define tenant timezone, locale, and currency as first-class settings.
142. **P0** Send ISO timestamps with offsets and store instants consistently in UTC.
143. **P1** Format dates, numbers, currencies, plurals, and statuses through Intl.
144. **P1** Test Costa Rica, New York, and Madrid timezone edge cases.
145. **P1** Set the real metadata base, canonical URLs, and environment validation.
146. **P1** Add LocalBusiness and Service structured metadata to public tenant pages.
147. **P1** Enforce public LCP, INP, CLS, and JavaScript bundle budgets.
148. **P1** Optimize fonts and images without layout shift.
149. **P1** Test responsive workflows at 320, 375, 768, 1024, and 1440 pixels.
150. **P2** Collect consent-aware Core Web Vitals and funnel analytics without PII.

### 16. Automated quality assurance

151. **P0** Add unit tests for domain rules, authorization, time, and money.
152. **P0** Add PostgreSQL integration tests using isolated ephemeral databases.
153. **P0** Add contract tests proving compatibility with existing `/api/v1` clients.
154. **P0** Add concurrent double-booking and idempotency tests.
155. **P0** Add Playwright golden paths for public, owner, and superadmin journeys.
156. **P1** Add Vitest and Testing Library coverage for frontend behavior.
157. **P1** Add automated axe accessibility checks and manual screen-reader review.
158. **P1** Add visual regression at the supported viewport matrix.
159. **P1** Add property tests for scheduling, DST, and booking transitions.
160. **P1** Set risk-based coverage thresholds and a documented flaky-test policy.

### 17. CI and software supply chain

161. **P0** Make image publishing depend on every required CI and security check.
162. **P0** Use frozen lockfiles and deterministic builds in CI and Docker.
163. **P0** Pin actions and base images to immutable revisions or digests.
164. **P0** Apply minimum GitHub token permissions per job.
165. **P0** Add secret scanning, SAST, dependency, license, and container scanning.
166. **P0** Generate SBOMs and sign images and provenance attestations.
167. **P1** Add migration validation against a new database on every PR.
168. **P1** Add API, frontend, accessibility, and end-to-end quality gates.
169. **P1** Add Dependabot or Renovate with controlled grouped updates.
170. **P1** Store test reports, traces, screenshots, and scan evidence as artifacts.

### 18. Delivery and infrastructure

171. **P0** Define production infrastructure as reviewed version-controlled code.
172. **P0** Deploy staging before production and promote the same image digest.
173. **P0** Use environment approvals and OIDC instead of long-lived cloud credentials.
174. **P0** Fail builds when production public URLs or secret references are missing.
175. **P0** Run readiness, migration, smoke, and rollback checks during deployment.
176. **P0** Run containers as non-root with read-only filesystems and dropped capabilities.
177. **P1** Define CPU, memory, process, connection, and autoscaling limits.
178. **P1** Add canary or blue-green deployment with documented abort thresholds.
179. **P1** Add immutable image retention and verified signature admission.
180. **P1** Create ephemeral preview environments with synthetic data and teardown.

### 19. Reliability and observability

181. **P0** Instrument structured logs, metrics, and traces with OpenTelemetry.
182. **P0** Define service-level indicators and objectives for booking and authentication.
183. **P0** Alert on actionable latency, errors, saturation, and business failures.
184. **P0** Configure encrypted PostgreSQL backups with offsite retention and PITR.
185. **P0** Restore backups regularly and retain evidence of recovery time and point.
186. **P1** Enable `pg_stat_statements`, slow-query review, and connection monitoring.
187. **P1** Monitor indexes, bloat, vacuum, locks, replicas, and migration duration.
188. **P1** Track booking conversion and failure reasons without customer PII.
189. **P1** Add error tracking linked to request and release identifiers.
190. **P1** Publish dashboards for RED, USE, SLO, database, and product metrics.

### 20. Operations, privacy, and documentation

191. **P0** Publish deploy, rollback, restore, secret rotation, and compromised-session runbooks.
192. **P0** Publish tenant-isolation, database-saturation, and stuck-migration incident runbooks.
193. **P0** Define on-call ownership, escalation, customer communication, and postmortems.
194. **P0** Document environment variables by sensitivity, requirement, owner, and rotation.
195. **P0** Publish the tenancy model, threat model, data dictionary, and retention policy.
196. **P0** Implement privacy terms, consent, export, correction, and deletion workflows.
197. **P1** Protect `main` with required checks, reviews, signed releases, and force-push prevention.
198. **P1** Maintain a production-readiness checklist with accountable evidence links.
199. **P1** Define release, schema compatibility, deprecation, and emergency-change policies.
200. **P1** Conduct a final architecture, security, accessibility, QA, and operations go-live review.

## Delivery slices

1. Foundation: ADRs, workspace, PostgreSQL, Prisma schema, RLS, migrations.
2. Identity: secure sessions, bootstrap, MFA, tenant policies, audit trail.
3. Core booking: availability engine, holds, concurrency, public flow.
4. Operations: owner and superadmin workflows, design system, accessibility.
5. Production: CI/CD, security supply chain, observability, backups, runbooks.

Each slice is delivered through a focused branch and pull request. Database
changes use expand/contract migrations; application PRs cannot depend on a
destructive schema change deployed in the same step.
