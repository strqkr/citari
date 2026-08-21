// `apiBaseUrl` is what the BROWSER uses (published host port, e.g. localhost:8000).
// `apiInternalBaseUrl` is what the Next.js SERVER uses for SSR/RSC fetches: inside
// Docker, "localhost" from the `web` container resolves to itself, not the `api`
// container, so server-side calls need the service hostname (`http://api:8000`).
// Outside Docker (host `pnpm dev`), both are reachable at localhost, so it defaults
// to the same value as apiBaseUrl.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const frontendConfig = {
  apiBaseUrl,
  apiInternalBaseUrl: process.env.API_INTERNAL_BASE_URL || apiBaseUrl,
  apiMode: process.env.NEXT_PUBLIC_API_MODE || "mock"
} as const;
