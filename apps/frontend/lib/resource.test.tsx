import { render, renderHook, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet } from "./api";
import { apiList, errMessage, useResource, useResourceOne } from "./resource";

vi.mock("./api", async (load) => {
  const actual = await load<typeof import("./api")>();
  return { ...actual, apiGet: vi.fn() };
});

const mockedGet = vi.mocked(apiGet);

describe("resource loading", () => {
  beforeEach(() => mockedGet.mockReset());

  it("unwraps paginated and array responses", async () => {
    mockedGet.mockResolvedValueOnce({ items: [1], page: 1, pageSize: 10, total: 1 });
    await expect(apiList<number>("/items")).resolves.toEqual([1]);
    mockedGet.mockResolvedValueOnce([2]);
    await expect(apiList<number>("/items")).resolves.toEqual([2]);
  });

  it("loads a list from the API", async () => {
    mockedGet.mockResolvedValueOnce(["real"]);
    const { result } = renderHook(() => useResource<string>("/items"));
    expect(result.current.items).toEqual([]);
    await waitFor(() => expect(result.current.items).toEqual(["real"]));
    expect(result.current.loading).toBe(false);
  });

  it("reports list and object failures without inventing data", async () => {
    mockedGet
      .mockRejectedValueOnce(new ApiError(503, "Unavailable", "Try later"))
      .mockRejectedValueOnce(new ApiError(503, "Unavailable", "Try later"));
    const list = renderHook(() => useResource<string>("/items"));
    const one = renderHook(() => useResourceOne<{ value: string }>("/item"));
    await waitFor(() => expect(list.result.current.error).toBe("Try later"));
    await waitFor(() => expect(one.result.current.error).toBe("Try later"));
    expect(list.result.current.items).toEqual([]);
    expect(one.result.current.data).toBeNull();
  });

  it("uses a safe generic message and accessible alert markup", async () => {
    expect(errMessage(new Error("secret"), "No se pudo cargar.")).toBe("No se pudo cargar.");
    const { container } = render(<div role="alert">No se pudo cargar.</div>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
