"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(value || "");
    history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) return setError("El enlace no contiene un desafío válido.");
    if (password !== confirmation) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    try {
      await apiPost(endpoints.auth.resetPassword, { challengeToken: token, newPassword: password });
      setDone(true);
      setToken("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "El enlace venció o ya fue utilizado.");
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell eyebrow="Recuperación segura" title={done ? "Contraseña actualizada" : "Crea una nueva contraseña"} subtitle="El desafío se elimina de la barra del navegador y solo puede utilizarse una vez." footer={<Link href="/login" className="font-semibold text-primary hover:underline">Volver al inicio de sesión</Link>}>
    {done ? <div role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Se revocaron las sesiones anteriores. Ya puedes ingresar con la nueva contraseña.</div> : token === null ? <p role="status" className="text-sm text-muted-foreground">Validando enlace...</p> : <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2"><Label htmlFor="reset-password">Nueva contraseña</Label><Input id="reset-password" type="password" minLength={16} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required aria-describedby="reset-password-help" /><p id="reset-password-help" className="text-xs text-muted-foreground">Mínimo 16 caracteres, con mayúscula, minúscula y número.</p></div>
      <div className="space-y-2"><Label htmlFor="reset-confirmation">Confirma la contraseña</Label><Input id="reset-confirmation" type="password" minLength={16} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading || !token}>{loading ? "Guardando..." : "Actualizar contraseña"}</Button>
    </form>}
  </AuthShell>;
}
