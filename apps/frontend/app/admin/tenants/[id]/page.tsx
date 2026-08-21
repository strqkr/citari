"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ApiError, apiGet, apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type Tenant = {
  tenantId: number;
  name: string;
  slug: string;
  status?: string;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
};

function statusClass(status?: string) {
  if (status === "activo") return "bg-primary/10 text-primary";
  if (status === "suspendido") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

export default function AdminTenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isMockMode()) {
      setTenant({ tenantId: Number(id), name: "Barberia Elite", slug: "barberia-elite", status: "activo", email: "info@barberiaelite.com", phone: "2222-1010" });
      setLoading(false);
      return;
    }
    apiGet<Tenant>(endpoints.admin.tenantById(id))
      .then(setTenant)
      .catch(() => setTenant(null))
      .finally(() => setLoading(false));
  }, [id]);

  async function action(kind: "activate" | "suspend") {
    setError(null);
    if (isMockMode()) {
      setTenant((t) => (t ? { ...t, status: kind === "activate" ? "activo" : "suspendido" } : t));
      return;
    }
    setBusy(true);
    try {
      const url = kind === "activate" ? endpoints.admin.activateTenant(id) : endpoints.admin.suspendTenant(id);
      const updated = await apiPost<Tenant>(url);
      setTenant(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo actualizar el estado.");
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = tenant
    ? [
        ["Slug", tenant.slug],
        ["Correo", tenant.email ?? "-"],
        ["Telefono", tenant.phone ?? "-"],
        ["Estado", tenant.status ?? "-"]
      ]
    : [];

  return (
    <AdminShell>
      <Link href="/admin/tenants" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Volver a negocios
      </Link>

      {loading ? (
        <p className="mt-6 text-muted-foreground">Cargando...</p>
      ) : !tenant ? (
        <p className="mt-6 text-muted-foreground">No se encontro el negocio.</p>
      ) : (
        <>
          <div className="mt-3">
            <PageHeader
              title={tenant.name}
              subtitle="Detalle y control del negocio."
              action={
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(tenant.status)}`}>
                  {tenant.status ?? "-"}
                </span>
              }
            />
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
            <dl className="divide-y divide-border">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {tenant.description ? (
              <p className="mt-4 text-sm text-muted-foreground">{tenant.description}</p>
            ) : null}

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            <div className="mt-6 flex gap-3">
              <Button onClick={() => action("activate")} disabled={busy || tenant.status === "activo"}>
                Activar
              </Button>
              <Button
                variant="outline"
                onClick={() => action("suspend")}
                disabled={busy || tenant.status === "suspendido"}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                Suspender
              </Button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
