"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PrivateShell } from "@/components/layout/PrivateShell";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, StatusBadge, textareaClass } from "@/components/ui/page-header";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Tenant>(endpoints.tenant.current)
      .then((tenant) => setForm(tenant))
      .catch(() => setError("No se pudo cargar la configuracion."));
  }, []);

  function update(key: keyof Tenant, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
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

        <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
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
          <p className="text-xs text-muted-foreground">La edicion del perfil estara disponible cuando el API habilite el contrato de actualizacion.</p>
        </div>
      </div>
    </PrivateShell>
  );
}
