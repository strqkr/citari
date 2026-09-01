import { NextRequest, NextResponse } from "next/server";
import { frontendConfig } from "@/lib/frontend-config";

const ACCESS_COOKIE = "citari_access";
const REFRESH_COOKIE = "citari_refresh";
const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;
const FORWARDED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
type TokenPair = { accessToken: string; refreshToken: string; tokenType?: string; expiresIn?: number };

function upstreamUrl(path: string[], searchParams?: URLSearchParams): URL {
  const url = new URL(`/api/v1/${path.map(encodeURIComponent).join("/")}`, frontendConfig.apiInternalBaseUrl);
  searchParams?.forEach((value, key) => url.searchParams.append(key, value));
  return url;
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

function setSession(response: NextResponse, pair: TokenPair): void {
  response.cookies.set(ACCESS_COOKIE, pair.accessToken, cookieOptions(ACCESS_MAX_AGE));
  response.cookies.set(REFRESH_COOKIE, pair.refreshToken, cookieOptions(REFRESH_MAX_AGE));
}

function clearSession(response: NextResponse): void {
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
}

async function callUpstream(url: URL, method: string, body: ArrayBuffer | undefined, contentType: string | null, accessToken?: string, idempotencyKey?: string | null): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  if (contentType) headers.set("Content-Type", contentType);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return fetch(url, { method, headers, body: method === "GET" ? undefined : body, cache: "no-store" });
}

async function readTokenPair(response: Response): Promise<TokenPair | null> {
  if (!response.ok) return null;
  const payload = await response.clone().json().catch(() => null) as Partial<TokenPair> | null;
  return payload?.accessToken && payload.refreshToken ? payload as TokenPair : null;
}

async function toNextResponse(upstream: Response): Promise<NextResponse> {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const body = await upstream.arrayBuffer();
  return new NextResponse(body.byteLength ? body : null, { status: upstream.status, headers });
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!FORWARDED_METHODS.has(request.method)) return NextResponse.json({ title: "Method not allowed", status: 405 }, { status: 405 });
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ title: "Origen no permitido", status: 403 }, { status: 403 });
  }

  const { path } = await context.params;
  const route = path.join("/");
  // Refresh credentials are accepted only from the HttpOnly cookie during the
  // automatic server-side rotation flow, never from browser-controlled JSON.
  if (route === "auth/refresh") return NextResponse.json({ title: "Not found", status: 404 }, { status: 404 });
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  const originalBody = request.method === "GET" ? undefined : await request.arrayBuffer();
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  try {
    if (route === "auth/logout") {
      if (!refreshToken) {
        const response = new NextResponse(null, { status: 204 });
        clearSession(response);
        return response;
      }
      const logoutBody = new TextEncoder().encode(JSON.stringify({ refreshToken })).buffer;
      const upstream = await callUpstream(upstreamUrl(path), "POST", logoutBody, "application/json");
      const response = await toNextResponse(upstream);
      clearSession(response);
      return response;
    }

    let upstream = await callUpstream(upstreamUrl(path, request.nextUrl.searchParams), request.method, originalBody, contentType, accessToken, idempotencyKey);
    if (["auth/login", "auth/password/change-initial", "auth/mfa/confirm"].includes(route)) {
      const pair = await readTokenPair(upstream);
      if (!pair) return toNextResponse(upstream);
      const response = NextResponse.json({ tokenType: pair.tokenType, expiresIn: pair.expiresIn }, { status: upstream.status });
      response.headers.set("Cache-Control", "no-store");
      setSession(response, pair);
      return response;
    }

    if (upstream.status === 401 && refreshToken && route !== "auth/refresh") {
      const refreshBody = new TextEncoder().encode(JSON.stringify({ refreshToken })).buffer;
      const refreshResponse = await callUpstream(upstreamUrl(["auth", "refresh"]), "POST", refreshBody, "application/json");
      const pair = await readTokenPair(refreshResponse);
      if (pair) {
        upstream = await callUpstream(upstreamUrl(path, request.nextUrl.searchParams), request.method, originalBody, contentType, pair.accessToken, idempotencyKey);
        const response = await toNextResponse(upstream);
        setSession(response, pair);
        if (upstream.status === 401) clearSession(response);
        return response;
      }
    }

    const response = await toNextResponse(upstream);
    if (upstream.status === 401) clearSession(response);
    return response;
  } catch {
    return NextResponse.json({ type: "about:blank", title: "Servicio no disponible", status: 503, detail: "No se pudo contactar el API." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
