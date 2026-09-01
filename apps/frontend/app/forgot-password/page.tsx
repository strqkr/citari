"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiPost(endpoints.auth.requestPasswordReset, { email });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo procesar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell eyebrow="Recuperación segura" title="Restablece tu contraseña" subtitle="Te enviaremos un enlace de un solo uso si el correo pertenece a una cuenta activa." footer={<Link href="/login" className="font-semibold text-primary hover:underline">Volver al inicio de sesión</Link>}>
    {done ? <div role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Si existe una cuenta activa con ese correo, recibirás instrucciones. Revisa también la carpeta de spam.</div> : <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2"><Label htmlFor="recovery-email">Correo electrónico</Label><Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Enviando..." : "Enviar enlace seguro"}</Button>
    </form>}
  </AuthShell>;
}
