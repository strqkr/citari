"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type Status = "checking" | "verified" | "request" | "sent" | "error";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    history.replaceState(null, "", window.location.pathname);
    if (!token) return setStatus("request");
    apiPost(endpoints.auth.verifyEmail, { challengeToken: token })
      .then(() => setStatus("verified"))
      .catch((err: unknown) => { setError(err instanceof ApiError ? err.detail || err.title : "El enlace venció o ya fue utilizado."); setStatus("error"); });
  }, []);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiPost(endpoints.auth.requestEmailVerification, { email });
      setStatus("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo procesar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell eyebrow="Identidad" title="Verificación de correo" subtitle="Los enlaces son de un solo uso y vencen automáticamente." footer={<Link href="/login" className="font-semibold text-primary hover:underline">Ir al inicio de sesión</Link>}>
    {status === "checking" ? <p role="status" className="text-sm text-muted-foreground">Verificando enlace...</p> : null}
    {status === "verified" ? <div role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Correo verificado correctamente. Tu solicitud ya puede ser activada.</div> : null}
    {status === "sent" ? <div role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Si la cuenta requiere verificación, enviaremos un nuevo enlace.</div> : null}
    {status === "error" ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}
    {(status === "request" || status === "error") ? <form className="space-y-4" onSubmit={resend}><div className="space-y-2"><Label htmlFor="verification-email">Correo electrónico</Label><Input id="verification-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>{error && status === "request" ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button type="submit" className="w-full" disabled={loading}>{loading ? "Enviando..." : "Enviar un nuevo enlace"}</Button></form> : null}
  </AuthShell>;
}
