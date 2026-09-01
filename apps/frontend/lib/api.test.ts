import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, clearAuthToken, getAuthToken, isMockMode, setAuthToken } from "./api";

describe("API client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("never enables mock runtime data", () => expect(isMockMode()).toBe(false));

  it("stores and clears the session token", () => {
    setAuthToken("token");
    expect(getAuthToken()).toBe("token");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it("parses problem details and clears rejected sessions", async () => {
    setAuthToken("expired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: "urn:test", title: "Unauthorized", status: 401, detail: "Expired", traceId: "trace"
    }), { status: 401, headers: { "content-type": "application/problem+json" } })));
    await expect(apiGet("/private")).rejects.toMatchObject({ status: 401, detail: "Expired", traceId: "trace" });
    expect(getAuthToken()).toBeNull();
  });

  it("supports all methods, JSON bodies and empty responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([apiPost("/x", { ok: true }), apiPatch("/x", {}), apiPut("/x", {}), apiDelete("/x")]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ ok: true }) });
  });

  it("does not expose invalid successful JSON as a fabricated value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 502, statusText: "Bad Gateway" })));
    await expect(apiGet("/x")).rejects.toMatchObject({ status: 502, detail: "not-json" });
  });
});
