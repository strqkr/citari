"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost, isMockMode, setAuthToken } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { LoginResponse } from "@/types/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isMockMode()) {
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    try {
      const response = await apiPost<LoginResponse>(endpoints.auth.login, {
        email,
        password,
        role: "owner"
      });
      setAuthToken(response.accessToken);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Panel del negocio"
      title="Iniciar sesion"
      subtitle="Accede para administrar servicios, disponibilidad, clientes y reservas."
      footer={
        <>
          Aun no tienes negocio?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Solicita acceso
          </Link>
          .
        </>
      }
    >
      <form className="space-y-4" onSubmit={submitLogin}>
        <div className="space-y-2">
          <Label htmlFor="email">Correo electronico</Label>
          <Input
            id="email"
            type="email"
            placeholder="owner@negocio.com"
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
          {loading ? "Ingresando..." : "Entrar al panel"}
        </Button>
      </form>
    </AuthShell>
  );
}
