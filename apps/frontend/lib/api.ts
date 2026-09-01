import { frontendConfig } from "@/lib/frontend-config";

const API_PREFIX = "/api/v1";

// Browser fetches (client components) need the host-published URL; Next.js
// server fetches (Server Components, SSR) need the internal Docker service
// URL — see lib/frontend-config.ts for why these can differ.
function apiBaseUrl(): string {
  return typeof window === "undefined" ? `${frontendConfig.apiInternalBaseUrl}${API_PREFIX}` : "/api/backend";
}

/**
 * Error raised for any non-2xx response. Wraps the RFC 7807
 * (application/problem+json) envelope the API returns on failures:
 * { type, title, status, detail, traceId }.
 */
export class ApiError extends Error {
  status: number;
  title: string;
  detail: string;
  type: string;
  traceId?: string;

  constructor(status: number, title: string, detail: string, type = "about:blank", traceId?: string) {
    super(detail || title);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.type = type;
    this.traceId = traceId;
  }
}

function isProblemDetail(value: unknown): value is { type?: string; title?: string; status?: number; detail?: string; traceId?: string } {
  return typeof value === "object" && value !== null && "status" in value;
}

async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin"
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const rawText = await response.text();
  let data: unknown;
  try {
    data = rawText ? JSON.parse(rawText) : undefined;
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    if (isProblemDetail(data)) {
      throw new ApiError(
        data.status ?? response.status,
        data.title ?? response.statusText ?? "Error",
        data.detail ?? "",
        data.type ?? "about:blank",
        data.traceId
      );
    }
    throw new ApiError(response.status, response.statusText || "Error", rawText || "Request failed");
  }

  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPostIdempotent<T>(path: string, body: unknown, key: string): Promise<T> {
  return request<T>("POST", path, body, { "Idempotency-Key": key });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}
