"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost, isMockMode, setAuthToken } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { LoginResponse } from "@/types/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isMockMode()) {
      router.push("/admin/tenants");
      return;
    }

    setLoading(true);
    try {
      const response = await apiPost<LoginResponse>(endpoints.auth.login, {
        email,
        password,
        role: "superadmin"
      });
      setAuthToken(response.accessToken);
      router.push("/admin/tenants");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Acceso interno"
      title="Panel superadmin"
      subtitle="Administra los negocios de la plataforma: activacion, suspension y auditoria."
      aside={
        <p className="max-w-md font-serif text-3xl leading-snug">
          Una plataforma, muchos negocios, <em className="italic text-primary">un solo control</em>.
        </p>
      }
    >
      <form className="space-y-4" onSubmit={submitLogin}>
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            placeholder="admin@citari.admin"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contrasena</Label>
          <Input
            id="password"
            type="password"
            placeholder="Tu contrasena"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
    </AuthShell>
  );
}
