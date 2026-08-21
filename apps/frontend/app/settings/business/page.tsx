"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PrivateShell } from "@/components/layout/PrivateShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, StatusBadge, textareaClass } from "@/components/ui/page-header";
import { ApiError, apiGet, apiPatch, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { mockTenant } from "@/lib/mock-data";

type Tenant = {
  slug: string;
  name: string;
  description?: string | null;
  publicMessage?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  status?: string;
};

export default function BusinessSettingsPage() {
  const [form, setForm] = useState<Tenant>({ slug: "", name: "" });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isMockMode()) {
      setForm({ ...mockTenant });
      return;
    }
    apiGet<Tenant>(endpoints.tenant.current)
      .then((tenant) => setForm(tenant))
      .catch(() => setForm({ ...mockTenant }));
  }, []);

  function update(key: keyof Tenant, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (isMockMode()) {
      setSaved(true);
      return;
    }
    setLoading(true);
    try {
      await apiPatch(endpoints.tenant.current, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        description: form.description,
        publicMessage: form.publicMessage,
        logoUrl: form.logoUrl
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PrivateShell>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Configuracion del negocio"
          subtitle="Actualiza la informacion publica que ven tus clientes en tu pagina de reservas."
          action={
            <Link href={`/book/${form.slug}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Ver pagina publica
            </Link>
          }
        />

        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Perfil publico</h2>
            <StatusBadge active={(form.status ?? "activo") === "activo"} labels={["Activo", "Suspendido"]} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug publico</Label>
              <Input id="slug" value={form.slug} disabled className="opacity-70" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input id="phone" value={form.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripcion</Label>
            <textarea id="description" className={textareaClass} value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="publicMessage">Mensaje publico</Label>
            <textarea id="publicMessage" className={textareaClass} value={form.publicMessage ?? ""} onChange={(e) => update("publicMessage", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logoUrl">URL del logo</Label>
            <Input id="logoUrl" placeholder="https://example.com/logo.png" value={form.logoUrl ?? ""} onChange={(e) => update("logoUrl", e.target.value)} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {saved ? <p className="text-sm text-primary">Cambios guardados.</p> : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </div>
    </PrivateShell>
  );
}
