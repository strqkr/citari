"use client";

import Link from "next/link";
import { CalendarCheck, Clock3, Scissors, Users } from "lucide-react";
import { PrivateShell } from "@/components/layout/PrivateShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { endpoints } from "@/lib/endpoints";
import { useResource, useResourceOne } from "@/lib/resource";
import type { Booking } from "@/types/booking";

type Dashboard = {
  name: string;
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  totalCustomers: number;
  totalActiveServices: number;
  totalActiveLocations: number;
};

const statusLabels: Record<Booking["status"], string> = {
  HELD: "Retenida", PENDING: "Pendiente", CONFIRMED: "Confirmada", CANCELLED: "Cancelada", COMPLETED: "Completada", NO_SHOW: "No asistio"
};

const statusVariant: Record<Booking["status"], "brand" | "success" | "muted" | "destructive"> = {
  HELD: "muted", PENDING: "muted", CONFIRMED: "brand", CANCELLED: "destructive", COMPLETED: "success", NO_SHOW: "destructive"
};

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  loading
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof Users;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-16" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: summary, loading: loadingSummary, error: summaryError } = useResourceOne<Dashboard>(endpoints.reports.dashboard);
  const { items: bookings, loading: loadingBookings, error: bookingsError } = useResource<Booking>(endpoints.bookings.list);

  const stats = [
    { label: "Reservas totales", value: summary?.totalBookings ?? 0, helper: "acumuladas", icon: CalendarCheck },
    { label: "Pendientes", value: summary?.pendingBookings ?? 0, helper: "por confirmar", icon: Clock3 },
    { label: "Servicios activos", value: summary?.totalActiveServices ?? 0, helper: "publicados", icon: Scissors },
    { label: "Clientes", value: summary?.totalCustomers ?? 0, helper: "registrados", icon: Users }
  ];
  const recent = bookings.slice(0, 6);
  const agenda = bookings.slice(0, 5);

  return (
    <PrivateShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-medium tracking-tight">Hola de nuevo</h2>
            <p className="mt-1 text-sm text-muted-foreground">{summary ? `Resumen operativo de ${summary.name}.` : "Resumen operativo."}</p>
          </div>
          <Button asChild>
            <Link href="/bookings">Ver reservas</Link>
          </Button>
        </div>

        {(summaryError || bookingsError) && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {summaryError || bookingsError}
          </div>
        )}

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} loading={loadingSummary} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border py-4">
              <CardTitle className="text-base">Reservas recientes</CardTitle>
              <Link href="/bookings" className="text-sm font-medium text-primary hover:underline">
                Ver todas
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingBookings ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell className="pl-6"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
                      </TableRow>
                    ))
                  ) : recent.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        Sin reservas todavia.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recent.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="pl-6 font-medium">{booking.customer.firstName} {booking.customer.lastName}</TableCell>
                        <TableCell className="text-muted-foreground">{booking.serviceName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(booking.startAt).toLocaleString("es-CR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[booking.status]}>{statusLabels[booking.status]}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-base">Agenda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {loadingBookings ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
              ) : agenda.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin citas.</p>
              ) : (
                agenda.map((booking) => (
                  <div key={booking.id} className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5">
                    <span className="w-12 font-mono text-xs text-muted-foreground">{new Date(booking.startAt).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{booking.customer.firstName} {booking.customer.lastName}</p>
                      <p className="truncate text-xs text-muted-foreground">{booking.serviceName}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </PrivateShell>
  );
}
