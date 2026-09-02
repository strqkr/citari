import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingConfirmationPage from "./book/[slug]/confirmation/page";
import TrackLookupPage from "./track/page";
import { CustomerStep } from "@/components/booking/CustomerStep";
import { DatetimeSelection } from "@/components/booking/DatetimeSelection";
import { apiPost, apiPostIdempotent } from "@/lib/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ slug: "shop" }),
  useSearchParams: () => new URLSearchParams(window.location.search)
}));
vi.mock("@/lib/api", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@/lib/api")>();
  return { ...original, apiPost: vi.fn(), apiPostIdempotent: vi.fn() };
});

describe("public booking integrity", () => {
  afterEach(cleanup);
  beforeEach(() => {
    push.mockReset();
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPostIdempotent).mockReset();
    history.replaceState(null, "", "/");
  });

  it("acquires a hold before entering customer data and carries the secret only in the fragment", async () => {
    history.replaceState(null, "", "/book/shop/datetime?service=service-id&location=location-id");
    vi.mocked(apiPostIdempotent).mockResolvedValue({ holdToken: "hold-secret", expiresAt: "2030-01-01T10:10:00Z" });
    const user = userEvent.setup();
    render(<DatetimeSelection slug="shop" slots={["2030-01-01T10:00:00.000Z"]} />);
    await user.click(screen.getByRole("button", { pressed: false }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(apiPostIdempotent).toHaveBeenCalledWith("/public/shop/holds", { serviceId: "service-id", locationId: "location-id", startAt: "2030-01-01T10:00:00.000Z" }, expect.any(String));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/book\/shop\/customer\?[^#]+#hold=hold-secret&expires=/));
    expect(String(push.mock.calls[0]?.[0]).split("#")[0]).not.toContain("hold-secret");
  });

  it("requires the fragment hold and redirects with only a confirmation nonce fragment", async () => {
    history.replaceState(null, "", "/book/shop/customer?service=service-id&location=location-id&startAt=2030-01-01T10%3A00%3A00.000Z#hold=hold-secret&expires=2030-01-01T10%3A10%3A00Z");
    vi.mocked(apiPostIdempotent).mockResolvedValue({ confirmationNonce: "confirmation-secret", expiresAt: "2030-01-01T10:15:00Z" });
    const user = userEvent.setup();
    render(<CustomerStep slug="shop" />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("Apellido"), "Prueba");
    await user.type(screen.getByLabelText("Correo electronico"), "ana@example.com");
    await user.type(screen.getByLabelText("Telefono"), "88888888");
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(apiPostIdempotent).toHaveBeenCalledWith("/public/shop/bookings", expect.objectContaining({ holdToken: "hold-secret" }), expect.any(String));
    expect(push).toHaveBeenCalledWith("/book/shop/confirmation#nonce=confirmation-secret");
  });

  it("consumes the confirmation nonce and removes it from browser history", async () => {
    history.replaceState(null, "", "/book/shop/confirmation#nonce=confirmation-secret");
    vi.mocked(apiPostIdempotent).mockResolvedValue({ trackingToken: "tracking-secret", booking: { id: "booking", status: "PENDING", startAt: "2030-01-01T10:00:00Z", endAt: "2030-01-01T10:30:00Z", serviceName: "Corte", servicePrice: null, currency: "CRC", customer: { firstName: "Ana" }, location: { name: "Centro" }, tenant: { name: "Negocio", timezone: "UTC", locale: "es-CR" } } });
    render(<BookingConfirmationPage />);
    await waitFor(() => expect(apiPostIdempotent).toHaveBeenCalledWith("/public/shop/booking-confirmation", { confirmationNonce: "confirmation-secret" }, expect.any(String)));
    expect(window.location.hash).toBe("");
    expect(await screen.findByRole("heading", { name: "Listo, Ana." })).toBeInTheDocument();
  });

  it("looks up tracking through a POST body and strips the fragment", async () => {
    history.replaceState(null, "", "/track#token=tracking-secret");
    vi.mocked(apiPost).mockResolvedValue({ id: "booking", version: 1, status: "PENDING", startAt: "2030-01-01T10:00:00Z", endAt: "2030-01-01T10:30:00Z", serviceName: "Corte", location: { name: "Centro" }, tenant: { name: "Negocio", timezone: "UTC", locale: "es-CR" } });
    render(<TrackLookupPage />);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/public/tracking/lookup", { token: "tracking-secret" }));
    expect(window.location.hash).toBe("");
    expect(await screen.findByRole("heading", { name: "Detalle de tu cita" })).toBeInTheDocument();
  });
});
