"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type Stage = "credentials" | "password" | "enrollment" | "confirmation" | "mfa";
type AuthResponse = {
  status?: "PASSWORD_CHANGE_REQUIRED" | "MFA_ENROLLMENT_REQUIRED" | "MFA_CONFIRMATION_REQUIRED" | "MFA_REQUIRED";
  challengeToken?: string;
  secret?: string;
  otpAuthUri?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [otpAuthUri, setOtpAuthUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function showError(err: unknown) {
    setError(err instanceof ApiError ? err.detail || err.title : "No se pudo completar la autenticación.");
  }

  async function finishAuthentication() {
    const profile = await apiGet<{ globalRole: "SUPER_ADMIN" | null }>(endpoints.auth.me);
    router.push(profile.globalRole === "SUPER_ADMIN" ? "/admin/tenants" : "/dashboard");
  }

  async function processAuthResponse(result: AuthResponse) {
    if (result.status === "PASSWORD_CHANGE_REQUIRED" && result.challengeToken) {
      setChallengeToken(result.challengeToken);
      setStage("password");
      return;
    }
    if (result.status === "MFA_ENROLLMENT_REQUIRED" && result.challengeToken) {
      setChallengeToken(result.challengeToken);
      setStage("enrollment");
      return;
    }
    if (result.status === "MFA_REQUIRED") {
      setStage("mfa");
      return;
    }
    await finishAuthentication();
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiPost<AuthResponse>(endpoints.auth.login, {
        email,
        password,
        ...(stage === "mfa" ? { mfaCode } : {})
      });
      await processAuthResponse(result);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<AuthResponse>(endpoints.auth.changeInitialPassword, { challengeToken, newPassword });
      setPassword(newPassword);
      await processAuthResponse(result);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  async function beginEnrollment() {
    setError(null);
    setLoading(true);
    try {
      const result = await apiPost<AuthResponse>(endpoints.auth.beginMfaEnrollment, { challengeToken });
      if (result.status !== "MFA_CONFIRMATION_REQUIRED" || !result.challengeToken || !result.secret || !result.otpAuthUri) {
        throw new Error("Invalid enrollment response");
      }
      setChallengeToken(result.challengeToken);
      setMfaSecret(result.secret);
      setOtpAuthUri(result.otpAuthUri);
      setStage("confirmation");
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiPost(endpoints.auth.confirmMfaEnrollment, { challengeToken, code: mfaCode });
      await finishAuthentication();
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  const title = stage === "password" ? "Protege tu cuenta" : stage === "enrollment" || stage === "confirmation" ? "Configura autenticación en dos pasos" : stage === "mfa" ? "Verifica que eres tú" : "Iniciar sesión";
  const subtitle = stage === "password" ? "Cambia la contraseña temporal antes de continuar." : stage === "enrollment" || stage === "confirmation" ? "Las cuentas privilegiadas requieren un código temporal además de la contraseña." : stage === "mfa" ? "Ingresa el código de seis dígitos de tu aplicación autenticadora." : "Accede para administrar servicios, disponibilidad, clientes y reservas.";

  return (
    <AuthShell
      eyebrow="Panel del negocio"
      title={title}
      subtitle={subtitle}
      footer={stage === "credentials" ? <>¿Aún no tienes negocio? <Link href="/register" className="font-semibold text-primary hover:underline">Solicita acceso</Link>.</> : undefined}
    >
      {(stage === "credentials" || stage === "mfa") && (
        <form className="space-y-4" onSubmit={submitLogin}>
          {stage === "credentials" ? <>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" placeholder="owner@negocio.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" placeholder="Tu contraseña" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
              <div className="text-right"><Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">¿Olvidaste tu contraseña?</Link></div>
            </div>
          </> : <div className="space-y-2">
            <Label htmlFor="mfa-code">Código de seguridad</Label>
            <Input id="mfa-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
          </div>}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Verificando..." : stage === "mfa" ? "Verificar código" : "Entrar al panel"}</Button>
        </form>
      )}

      {stage === "password" && (
        <form className="space-y-4" onSubmit={submitPasswordChange}>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={16} required autoComplete="new-password" aria-describedby="password-help" />
            <p id="password-help" className="text-xs text-muted-foreground">Mínimo 16 caracteres, con mayúscula, minúscula y número.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirma la contraseña</Label>
            <Input id="confirm-password" type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={16} required autoComplete="new-password" />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Cambiar contraseña"}</Button>
        </form>
      )}

      {stage === "enrollment" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Ten lista una aplicación compatible con TOTP, como 1Password, Bitwarden, Google Authenticator o Microsoft Authenticator.</p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="button" className="w-full" disabled={loading} onClick={beginEnrollment}>{loading ? "Preparando..." : "Configurar ahora"}</Button>
        </div>
      )}

      {stage === "confirmation" && (
        <form className="space-y-4" onSubmit={confirmEnrollment}>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Agrega esta cuenta en tu autenticador</p>
            <a href={otpAuthUri} className="mt-2 inline-block font-semibold text-primary hover:underline">Abrir aplicación autenticadora</a>
            <p className="mt-3 text-xs text-muted-foreground">Clave manual</p>
            <code className="mt-1 block break-all rounded bg-background p-2 font-mono text-xs">{mfaSecret}</code>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmation-code">Código de seis dígitos</Label>
            <Input id="confirmation-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Verificando..." : "Activar y continuar"}</Button>
        </form>
      )}
    </AuthShell>
  );
}
