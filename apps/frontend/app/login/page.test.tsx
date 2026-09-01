import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { apiGet, apiPost } from "@/lib/api";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/lib/api", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@/lib/api")>();
  return { ...original, apiGet: vi.fn(), apiPost: vi.fn() };
});

describe("LoginPage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiGet).mockResolvedValue({ globalRole: null });
    push.mockReset();
  });

  it("is accessible and exposes correctly labelled credentials", async () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("autocomplete", "current-password");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("submits to the real session endpoint and prevents duplicate submissions", async () => {
    let resolveLogin!: () => void;
    vi.mocked(apiPost).mockReturnValue(new Promise((resolve) => { resolveLogin = () => resolve({}); }));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Correo electrónico"), "owner@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "secure-password");
    await user.click(screen.getByRole("button", { name: "Entrar al panel" }));
    expect(screen.getByRole("button", { name: "Verificando..." })).toBeDisabled();
    expect(apiPost).toHaveBeenCalledWith("/auth/login", {
      email: "owner@example.com",
      password: "secure-password"
    });
    resolveLogin();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("completes the mandatory password and MFA enrollment journey without persisting challenge secrets", async () => {
    vi.mocked(apiGet).mockResolvedValue({ globalRole: "SUPER_ADMIN" });
    vi.mocked(apiPost)
      .mockResolvedValueOnce({ status: "PASSWORD_CHANGE_REQUIRED", challengeToken: "password-challenge" })
      .mockResolvedValueOnce({ status: "MFA_ENROLLMENT_REQUIRED", challengeToken: "enroll-challenge" })
      .mockResolvedValueOnce({ status: "MFA_CONFIRMATION_REQUIRED", challengeToken: "confirm-challenge", secret: "BASE32SECRET", otpAuthUri: "otpauth://citari" })
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Correo electrónico"), "andrew@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "TemporaryPassword2026");
    await user.click(screen.getByRole("button", { name: "Entrar al panel" }));
    await screen.findByRole("heading", { name: "Protege tu cuenta" });

    await user.type(screen.getByLabelText("Nueva contraseña"), "PermanentPassword2026");
    await user.type(screen.getByLabelText("Confirma la contraseña"), "PermanentPassword2026");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    await user.click(await screen.findByRole("button", { name: "Configurar ahora" }));
    expect(await screen.findByText("BASE32SECRET")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Código de seis dígitos"), "123456");
    await user.click(screen.getByRole("button", { name: "Activar y continuar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/tenants"));
    expect(apiPost).toHaveBeenNthCalledWith(4, "/auth/mfa/confirm", { challengeToken: "confirm-challenge", code: "123456" });
  });

  it("requests a TOTP code after valid privileged credentials", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({ status: "MFA_REQUIRED" }).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText("Correo electrónico"), "andrew@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "PermanentPassword2026");
    await user.click(screen.getByRole("button", { name: "Entrar al panel" }));
    await user.type(await screen.findByLabelText("Código de seguridad"), "654321");
    await user.click(screen.getByRole("button", { name: "Verificar código" }));
    expect(apiPost).toHaveBeenLastCalledWith("/auth/login", { email: "andrew@example.com", password: "PermanentPassword2026", mfaCode: "654321" });
  });
});
