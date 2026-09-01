// `apiBaseUrl` is what the BROWSER uses (published host port, e.g. localhost:8000).
// `apiInternalBaseUrl` is what the Next.js SERVER uses for SSR/RSC fetches: inside
// Docker, "localhost" from the `web` container resolves to itself, not the `api`
// container, so server-side calls need the service hostname (`http://api:8000`).
// Outside Docker (host `pnpm dev`), both are reachable at localhost, so it defaults
// to the same value as apiBaseUrl.
function requiredUrl(name: string, value: string | undefined, fallback?: string): string {
  const candidate = value?.trim() || fallback;
  if (!candidate) {
    throw new Error(`${name} is required. Refusing to start without a real API endpoint.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https.`);
  }
  return candidate.replace(/\/$/, "");
}

const isProduction = process.env.NODE_ENV === "production";
const apiBaseUrl = requiredUrl(
  "NEXT_PUBLIC_API_BASE_URL",
  process.env.NEXT_PUBLIC_API_BASE_URL,
  isProduction ? undefined : "http://localhost:8000"
);

const configuredMode = process.env.NEXT_PUBLIC_API_MODE;
if (configuredMode && configuredMode !== "api") {
  throw new Error("NEXT_PUBLIC_API_MODE only supports 'api'; mock runtime data has been removed.");
}

export const frontendConfig = {
  apiBaseUrl,
  apiInternalBaseUrl: requiredUrl("API_INTERNAL_BASE_URL", process.env.API_INTERNAL_BASE_URL, apiBaseUrl)
} as const;
