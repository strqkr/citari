import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { apiPost } from "@/lib/api";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/lib/api", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@/lib/api")>();
  return { ...original, apiPost: vi.fn() };
});

describe("LoginPage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    push.mockReset();
  });

  it("is accessible and exposes correctly labelled credentials", async () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByLabelText("Correo electronico")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Contrasena")).toHaveAttribute("autocomplete", "current-password");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("submits to the real session endpoint and prevents duplicate submissions", async () => {
    let resolveLogin!: () => void;
    vi.mocked(apiPost).mockReturnValue(new Promise((resolve) => { resolveLogin = () => resolve(undefined); }));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Correo electronico"), "owner@example.com");
    await user.type(screen.getByLabelText("Contrasena"), "secure-password");
    await user.click(screen.getByRole("button", { name: "Entrar al panel" }));
    expect(screen.getByRole("button", { name: "Ingresando..." })).toBeDisabled();
    expect(apiPost).toHaveBeenCalledWith("/auth/login", {
      email: "owner@example.com",
      password: "secure-password"
    });
    resolveLogin();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });
});
