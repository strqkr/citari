"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock, ExternalLink, MoreHorizontal, PauseCircle, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/admin/manager-ui";
import { apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { errMessage, useResource } from "@/lib/resource";

type Tenant = {
  tenantId: number;
  name: string;
  slug: string;
  email?: string | null;
  status?: string;
};

const mockTenants: Tenant[] = [
  { tenantId: 1, name: "Barberia El Colocho", slug: "barberia-el-colocho", email: "info@colochocr.com", status: "activo" },
  { tenantId: 2, name: "Salon Elegance", slug: "salon-elegance", email: "contacto@elegancecr.com", status: "pendiente" },
  { tenantId: 3, name: "Veterinaria San Jorge", slug: "vet-san-jorge", email: "vet@sanjorge.com", status: "suspendido" }
];

type StatusFilter = "todos" | "activo" | "pendiente" | "suspendido";

const tabs: { key: StatusFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendiente", label: "Solicitudes" },
  { key: "activo", label: "Activos" },
  { key: "suspendido", label: "Suspendidos" }
];

function statusBadge(status?: string) {
  if (status === "activo") return <Badge variant="success">Activo</Badge>;
  if (status === "suspendido") return <Badge variant="destructive">Suspendido</Badge>;
  if (status === "pendiente") return <Badge variant="warning">Pendiente</Badge>;
  return <Badge variant="muted">{status ?? "-"}</Badge>;
}

export function TenantsManager() {
  const { items: tenants, setItems, loading, error, setError, reload } = useResource<Tenant>(
    `${endpoints.admin.tenants}?pageSize=100`,
    mockTenants
  );
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<StatusFilter>("todos");
  const [busyId, setBusyId] = useState<number | null>(null);

  const counts = useMemo(() => {
    const c = { total: tenants.length, activo: 0, pendiente: 0, suspendido: 0 };
    for (const t of tenants) {
      if (t.status === "activo") c.activo++;
      else if (t.status === "pendiente") c.pendiente++;
      else if (t.status === "suspendido") c.suspendido++;
    }
    return c;
  }, [tenants]);

  const term = search.toLowerCase();
  const filtered = tenants.filter((t) => {
    const matchesTab = tab === "todos" || t.status === tab;
    const matchesSearch = `${t.name} ${t.slug} ${t.email ?? ""}`.toLowerCase().includes(term);
    return matchesTab && matchesSearch;
  });

  async function action(tenant: Tenant, kind: "activate" | "suspend") {
    const nextStatus = kind === "activate" ? "activo" : "suspendido";
    if (isMockMode()) {
      setItems((cur) => cur.map((t) => (t.tenantId === tenant.tenantId ? { ...t, status: nextStatus } : t)));
      return;
    }
    setError(null);
    setBusyId(tenant.tenantId);
    try {
      const url = kind === "activate" ? endpoints.admin.activateTenant(tenant.tenantId) : endpoints.admin.suspendTenant(tenant.tenantId);
      const updated = await apiPost<Tenant>(url);
      setItems((cur) => cur.map((t) => (t.tenantId === tenant.tenantId ? { ...t, ...updated } : t)));
    } catch (err) {
      setError(errMessage(err, "No se pudo actualizar el negocio."));
    } finally {
      setBusyId(null);
    }
  }

  const kpis = [
    { label: "Negocios", value: counts.total, icon: Building2, tone: "text-foreground" },
    { label: "Activos", value: counts.activo, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Solicitudes", value: counts.pendiente, icon: Clock, tone: "text-amber-600" },
    { label: "Suspendidos", value: counts.suspendido, icon: PauseCircle, tone: "text-destructive" }
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-medium tracking-tight">Negocios</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Administra los negocios de la plataforma: revisa solicitudes, activa y suspende.
        </p>
      </div>

      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <Icon className={`h-4 w-4 ${k.tone}`} />
                </div>
                {loading ? <Skeleton className="mt-3 h-8 w-12" /> : <p className="mt-2 text-3xl font-semibold tracking-tight">{k.value}</p>}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${
                    tab === t.key ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {t.key === "pendiente" && counts.pendiente > 0 ? (
                    <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 text-xs text-amber-700">{counts.pendiente}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar negocio" className="pl-8" />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Negocio</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-6"><Skeleton className="h-4 w-44" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="ml-auto h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                    {tab === "pendiente" ? "No hay solicitudes pendientes." : "No hay negocios que coincidan."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((tenant) => (
                  <TableRow key={tenant.tenantId} className={busyId === tenant.tenantId ? "opacity-50" : undefined}>
                    <TableCell className="pl-6">
                      <span className="block font-medium">{tenant.name}</span>
                      {tenant.email ? <span className="text-xs text-muted-foreground">{tenant.email}</span> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{tenant.slug}</TableCell>
                    <TableCell>{statusBadge(tenant.status)}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal /><span className="sr-only">Acciones</span></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/tenants/${tenant.tenantId}`}>
                              <ExternalLink />
                              Ver detalle
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => action(tenant, "activate")} disabled={tenant.status === "activo"}>
                            <Play />
                            {tenant.status === "pendiente" ? "Aprobar y activar" : "Activar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => action(tenant, "suspend")}
                            disabled={tenant.status === "suspendido"}
                            className="text-destructive focus:text-destructive"
                          >
                            <PauseCircle />
                            Suspender
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
