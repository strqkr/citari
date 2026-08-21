"use client";

import { BarChart3, CalendarClock, MapPin, Users } from "lucide-react";
import { PrivateShell } from "@/components/layout/PrivateShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { endpoints } from "@/lib/endpoints";
import { useResource, useResourceOne } from "@/lib/resource";

type Dashboard = { totalBookings: number; totalCustomers: number; totalActiveServices: number; totalActiveLocations: number };
type ServiceDemand = { serviceId: number; serviceName: string; totalBookings: number; lastBookingAt: string | null };
type AvailabilityStatus = {
  availabilityBlockId: number;
  locationName: string;
  blockDate: string;
  startTime: string;
  endTime: string;
  isReserved: boolean;
};

const mockDashboard: Dashboard = { totalBookings: 143, totalCustomers: 248, totalActiveServices: 18, totalActiveLocations: 2 };
const mockDemand: ServiceDemand[] = [
  { serviceId: 1, serviceName: "Limpieza dental", totalBookings: 42, lastBookingAt: "2026-05-19" },
  { serviceId: 2, serviceName: "Consulta odontologica", totalBookings: 28, lastBookingAt: "2026-05-18" },
  { serviceId: 3, serviceName: "Blanqueamiento dental", totalBookings: 21, lastBookingAt: "2026-05-15" }
];
const mockAvailability: AvailabilityStatus[] = [
  { availabilityBlockId: 1, locationName: "Sede central", blockDate: "2026-05-20", startTime: "09:00", endTime: "09:30", isReserved: false },
  { availabilityBlockId: 2, locationName: "Sede central", blockDate: "2026-05-20", startTime: "11:00", endTime: "11:30", isReserved: false },
  { availabilityBlockId: 3, locationName: "Sede central", blockDate: "2026-05-20", startTime: "14:00", endTime: "14:30", isReserved: true }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { data: summary, loading } = useResourceOne<Dashboard>(endpoints.reports.dashboard, mockDashboard);
  const { items: demand } = useResource<ServiceDemand>(endpoints.reports.servicesDemand, mockDemand);
  const { items: availability } = useResource<AvailabilityStatus>(
    `${endpoints.reports.availabilityStatus}?date=${todayIso()}`,
    mockAvailability
  );

  const kpis = [
    { label: "Reservas totales", value: summary.totalBookings, helper: "acumuladas", icon: BarChart3 },
    { label: "Clientes", value: summary.totalCustomers, helper: "con historial", icon: Users },
    { label: "Servicios activos", value: summary.totalActiveServices, helper: "publicados", icon: CalendarClock },
    { label: "Sedes activas", value: summary.totalActiveLocations, helper: "operando", icon: MapPin }
  ];

  return (
    <PrivateShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="font-serif text-2xl font-medium tracking-tight">Reportes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Indicadores operativos de reservas, servicios y disponibilidad.</p>
        </div>

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <Card key={k.label}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  </div>
                  {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 text-3xl font-semibold tracking-tight">{k.value}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{k.helper}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-border py-4"><CardTitle className="text-base">Demanda de servicios</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Servicio</TableHead>
                    <TableHead>Reservas</TableHead>
                    <TableHead>Ultima</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demand.map((row) => (
                    <TableRow key={row.serviceId}>
                      <TableCell className="pl-6 font-medium">{row.serviceName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.totalBookings}</TableCell>
                      <TableCell className="text-muted-foreground">{row.lastBookingAt?.slice(0, 10) ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border py-4"><CardTitle className="text-base">Estado de disponibilidad</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Fecha</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availability.map((row) => (
                    <TableRow key={row.availabilityBlockId}>
                      <TableCell className="pl-6 text-muted-foreground">{row.blockDate}</TableCell>
                      <TableCell className="font-mono text-xs">{row.startTime} - {row.endTime}</TableCell>
                      <TableCell><Badge variant={row.isReserved ? "muted" : "success"}>{row.isReserved ? "Reservado" : "Disponible"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </PrivateShell>
  );
}
