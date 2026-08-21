"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type BusinessType = { businessTypeId: number; name: string };

const inputClass =
  "flex h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground shadow-soft focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export default function RegisterPage() {
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [form, setForm] = useState({
    businessName: "",
    businessTypeId: "",
    slug: "",
    businessEmail: "",
    ownerFirstName: "",
    ownerLastName: "",
    ownerEmail: "",
    password: "",
    phone: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isMockMode()) return;
    apiGet<BusinessType[]>(endpoints.businessTypes)
      .then((list) => setTypes(list))
      .catch(() => setTypes([]));
  }, []);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (isMockMode()) {
      setDone(true);
      return;
    }
    setLoading(true);
    try {
      await apiPost(endpoints.auth.registerOwner, {
        businessName: form.businessName,
        businessTypeId: Number(form.businessTypeId),
        slug: form.slug,
        businessEmail: form.businessEmail,
        ownerFirstName: form.ownerFirstName,
        ownerLastName: form.ownerLastName,
        ownerEmail: form.ownerEmail,
        password: form.password,
        phone: form.phone || null
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        eyebrow="Solicitud enviada"
        title="Tu negocio esta en camino"
        subtitle="Recibimos los datos. En cuanto el acceso quede activo podras entrar al panel."
        footer={
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Ir a iniciar sesion
          </Link>
        }
      >
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
          Siguiente paso: activamos el acceso y configuras servicios, horarios y disponibilidad.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Nuevo negocio"
      title="Crear cuenta"
      subtitle="Comparte los datos de tu negocio y del responsable para preparar tu espacio de reservas."
      footer={
        <>
          Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Inicia sesion
          </Link>
          .
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="businessName">Nombre del negocio</Label>
          <Input id="businessName" value={form.businessName} onChange={(e) => update("businessName", e.target.value)} placeholder="Barberia Elite" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="businessTypeId">Tipo de negocio</Label>
            <select
              id="businessTypeId"
              className={inputClass}
              value={form.businessTypeId}
              onChange={(e) => update("businessTypeId", e.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona...
              </option>
              {types.map((t) => (
                <option key={t.businessTypeId} value={t.businessTypeId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug publico</Label>
            <Input id="slug" value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="barberia-elite" required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="businessEmail">Correo del negocio</Label>
          <Input id="businessEmail" type="email" value={form.businessEmail} onChange={(e) => update("businessEmail", e.target.value)} placeholder="info@negocio.com" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="ownerFirstName">Nombre</Label>
            <Input id="ownerFirstName" value={form.ownerFirstName} onChange={(e) => update("ownerFirstName", e.target.value)} placeholder="Sofia" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerLastName">Apellido</Label>
            <Input id="ownerLastName" value={form.ownerLastName} onChange={(e) => update("ownerLastName", e.target.value)} placeholder="Campos" required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ownerEmail">Correo del responsable</Label>
          <Input id="ownerEmail" type="email" value={form.ownerEmail} onChange={(e) => update("ownerEmail", e.target.value)} placeholder="owner@negocio.com" required autoComplete="email" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="password">Contrasena</Label>
            <Input id="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Minimo 8 caracteres" required autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefono</Label>
            <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="8888-8888" />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Enviando..." : "Enviar solicitud"}
        </Button>
      </form>
    </AuthShell>
  );
}
