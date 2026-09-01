import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./forgot-password/page";
import ResetPasswordPage from "./reset-password/page";
import VerifyEmailPage from "./verify-email/page";
import { apiPost } from "@/lib/api";

vi.mock("@/lib/api", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@/lib/api")>();
  return { ...original, apiPost: vi.fn() };
});

describe("identity recovery pages", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPost).mockResolvedValue({});
    history.replaceState(null, "", "/");
  });

  it("returns an anti-enumeration response for password reset requests", async () => {
    const user = userEvent.setup();
    const { container } = render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Correo electrónico"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace seguro" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Si existe una cuenta activa");
    expect(apiPost).toHaveBeenCalledWith("/auth/password/reset/request", { email: "owner@example.com" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("reads the reset token from the URL fragment, removes it, and updates the password", async () => {
    history.replaceState(null, "", "/reset-password#token=fragment-token");
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    await user.type(screen.getByLabelText("Nueva contraseña"), "RecoveredPassword2027A");
    await user.type(screen.getByLabelText("Confirma la contraseña"), "RecoveredPassword2027A");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
    expect(apiPost).toHaveBeenCalledWith("/auth/password/reset", { challengeToken: "fragment-token", newPassword: "RecoveredPassword2027A" });
    expect(await screen.findByRole("status")).toHaveTextContent("Se revocaron las sesiones anteriores");
  });

  it("verifies an email token without leaving it in browser history", async () => {
    history.replaceState(null, "", "/verify-email#token=verification-token");
    render(<VerifyEmailPage />);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/auth/email/verify", { challengeToken: "verification-token" }));
    expect(window.location.hash).toBe("");
    expect(await screen.findByRole("status")).toHaveTextContent("Correo verificado correctamente");
  });
});
