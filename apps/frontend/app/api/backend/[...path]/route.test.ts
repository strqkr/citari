import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const request = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("origin")) headers.set("origin", "http://localhost:3000");
  return new NextRequest(`http://localhost:3000/api/backend/${path}`, { method: init?.method, body: init?.body, headers });
};
const decodeBody = (body: BodyInit | null | undefined) => JSON.parse(new TextDecoder().decode(body as ArrayBuffer));

describe("backend session proxy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("stores login tokens in separate HttpOnly cookies without exposing them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer", expiresIn: 900 })));
    const response = await POST(request("auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.co", password: "secret" }), headers: { "content-type": "application/json" } }), context(["auth", "login"]));

    expect(await response.json()).toEqual({ tokenType: "Bearer", expiresIn: 900 });
    const cookies = response.headers.getSetCookie().join(";");
    expect(cookies).toContain("citari_access=access");
    expect(cookies).toContain("citari_refresh=refresh");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("Max-Age=900");
    expect(cookies).toContain("Max-Age=2592000");
  });

  it("stores tokens only after the final MFA confirmation step", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ accessToken: "mfa-access", refreshToken: "mfa-refresh", tokenType: "Bearer", expiresIn: 900 })));
    const response = await POST(request("auth/mfa/confirm", { method: "POST", body: JSON.stringify({ challengeToken: "challenge", code: "123456" }), headers: { "content-type": "application/json" } }), context(["auth", "mfa", "confirm"]));
    expect(response.headers.getSetCookie().join(";")).toContain("citari_access=mfa-access");
    expect(await response.json()).toEqual({ tokenType: "Bearer", expiresIn: 900 });
  });

  it("rotates once after 401, updates cookies and retries with the new access token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ status: 401 }, 401))
      .mockResolvedValueOnce(json({ accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 900 }))
      .mockResolvedValueOnce(json({ id: "user" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(request("auth/me", { headers: { cookie: "citari_access=old; citari_refresh=refresh" } }), context(["auth", "me"]));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(decodeBody(fetchMock.mock.calls[1][1]?.body)).toEqual({ refreshToken: "refresh" });
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("authorization")).toBe("Bearer new-access");
    expect(response.headers.getSetCookie().join(";")).toContain("citari_refresh=new-refresh");
  });

  it("sends the HttpOnly refresh token to logout and clears both cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request("auth/logout", { method: "POST", headers: { cookie: "citari_access=access; citari_refresh=refresh" } }), context(["auth", "logout"]));

    expect(decodeBody(fetchMock.mock.calls[0][1]?.body)).toEqual({ refreshToken: "refresh" });
    expect(response.status).toBe(204);
    const cookies = response.headers.getSetCookie().join(";");
    expect(cookies).toContain("citari_access=");
    expect(cookies).toContain("citari_refresh=");
  });

  it("does not loop without a refresh token and clears rejected access", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ status: 401 }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(request("auth/me", { headers: { cookie: "citari_access=expired" } }), context(["auth", "me"]));
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.headers.getSetCookie().join(";")).toContain("citari_access=");
  });
});
