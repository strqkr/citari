import { expect, test, type Route } from "@playwright/test";

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const requestBody = (route: Route): unknown => route.request().postData() ? route.request().postDataJSON() : undefined;

test("privileged login completes password change and MFA enrollment", async ({ page }) => {
  const requests: { path: string; body: unknown }[] = [];
  await page.route("**/api/backend/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = requestBody(route);
    requests.push({ path, body });
    if (path.endsWith("/auth/login")) return json(route, { status: "PASSWORD_CHANGE_REQUIRED", challengeToken: "password-challenge" });
    if (path.endsWith("/auth/password/change-initial")) return json(route, { status: "MFA_ENROLLMENT_REQUIRED", challengeToken: "enrollment-challenge" });
    if (path.endsWith("/auth/mfa/enroll")) return json(route, { status: "MFA_CONFIRMATION_REQUIRED", challengeToken: "mfa-challenge", secret: "ABCDEFGHIJKLMNOP", otpAuthUri: "otpauth://totp/Citari:test" });
    if (path.endsWith("/auth/mfa/confirm")) return json(route, {});
    if (path.endsWith("/auth/me")) return json(route, { globalRole: "SUPER_ADMIN", email: "admin@example.test" });
    if (path.endsWith("/admin/tenants")) return json(route, { items: [], pagination: { page: 1, pageSize: 25, total: 0, pages: 0 } });
    return json(route, { id: "tenant", slug: "test", name: "Test", status: "ACTIVE" });
  });

  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@example.test");
  await page.getByLabel("Contraseña").fill("TemporaryPassword2026A");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(page.getByRole("heading", { name: "Protege tu cuenta" })).toBeVisible();

  await page.getByLabel("Nueva contraseña").fill("PermanentPassword2026B");
  await page.getByLabel("Confirma la contraseña").fill("PermanentPassword2026B");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await page.getByRole("button", { name: "Configurar ahora" }).click();
  await expect(page.getByText("ABCDEFGHIJKLMNOP")).toBeVisible();
  await page.getByLabel("Código de seis dígitos").fill("123456");
  await page.getByRole("button", { name: "Activar y continuar" }).click();
  await expect(page).toHaveURL(/\/admin\/tenants$/);
  expect(requests).toContainEqual({ path: "/api/backend/auth/password/change-initial", body: { challengeToken: "password-challenge", newPassword: "PermanentPassword2026B" } });
  expect(requests).toContainEqual({ path: "/api/backend/auth/mfa/confirm", body: { challengeToken: "mfa-challenge", code: "123456" } });
});

test("tracking secrets remain in POST bodies through verified lookup", async ({ page }) => {
  const requests: { url: string; body: unknown }[] = [];
  await page.route("**/api/backend/public/tracking/**", async (route) => {
    const url = route.request().url();
    const body = requestBody(route);
    requests.push({ url, body });
    if (url.endsWith("/verification/request")) return json(route, { challengeToken: "challenge-secret", expiresAt: "2030-01-01T10:10:00Z", destination: "a**@example.test" }, 202);
    if (url.endsWith("/verification/confirm")) return json(route, { accessGrant: "grant-secret", expiresAt: "2030-01-01T10:15:00Z" });
    return json(route, { id: "booking", version: 1, status: "PENDING", startAt: "2030-01-01T10:00:00Z", endAt: "2030-01-01T10:30:00Z", serviceName: "Consulta", location: { name: "Central" }, tenant: { name: "Citari", timezone: "UTC", locale: "es-CR" } });
  });

  await page.goto("/track");
  await page.getByLabel("Acceso de seguimiento").fill("tracking-secret");
  await page.getByRole("button", { name: "Enviar código de verificación" }).click();
  await page.getByLabel("Código de seis dígitos").fill("123456");
  await page.getByRole("button", { name: "Verificar y consultar" }).click();
  await expect(page.getByRole("heading", { name: "Detalle de tu cita" })).toBeVisible();
  expect(requests.some((request) => request.url.includes("tracking-secret") || request.url.includes("grant-secret"))).toBe(false);
  expect(requests.at(-1)?.body).toEqual({ token: "tracking-secret", accessGrant: "grant-secret" });
});
