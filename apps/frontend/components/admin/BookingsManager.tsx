"use client";

import { useState } from "react";
import { CalendarClock, Check, CheckCheck, MoreHorizontal, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { selectClass } from "@/components/ui/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { apiGet, apiPatch } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { errMessage, useResource } from "@/lib/resource";
import type { AvailabilityResponse } from "@/types/availability";
import type { Booking } from "@/types/booking";

const statusLabels: Record<Booking["status"], string> = {
  HELD: "Retenida", PENDING: "Pendiente", CONFIRMED: "Confirmada", CANCELLED: "Cancelada", COMPLETED: "Completada", NO_SHOW: "No asistio"
};

const statusVariant: Record<Booking["status"], "brand" | "success" | "muted" | "destructive"> = {
  HELD: "muted", PENDING: "muted", CONFIRMED: "brand", CANCELLED: "destructive", COMPLETED: "success", NO_SHOW: "destructive"
};

export function BookingsManager() {
  const { items: bookings, setItems: setBookings, loading, error, setError, reload } = useResource<Booking>(endpoints.bookings.list);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState<AvailabilityResponse>({ timezone: "UTC", slots: [] });
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function replace(updated: Booking) {
    setBookings((current) => current.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
  }

  async function lifecycle(booking: Booking, action: "confirm" | "complete" | "noShow" | "cancel") {
    setError(null);
    setBusyId(booking.id);
    try {
      const updated = await apiPatch<Booking>(endpoints.bookings[action](booking.id), { version: booking.version });
      replace(updated);
    } catch (err) {
      setError(errMessage(err, "No se pudo actualizar la reserva."));
    } finally {
      setBusyId(null);
    }
  }

  async function openReschedule(booking: Booking) {
    setSelectedBooking(booking);
    setSelectedSlot("");
    setAvailableSlots({ timezone: booking.location.timezone ?? "UTC", slots: [] });
    setSlotsLoading(true);
    try {
      const from = new Date(), to = new Date(from.getTime() + 14 * 86_400_000);
      const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      setAvailableSlots(await apiGet<AvailabilityResponse>(`${endpoints.bookings.availability(booking.id)}?${query}`));
    } catch (err) {
      setError(errMessage(err, "No se pudieron cargar horarios disponibles."));
    } finally {
      setSlotsLoading(false);
    }
  }

  async function rescheduleBooking() {
    if (!selectedBooking || !selectedSlot) return;
    const target = selectedBooking;
    setError(null);
    setBusyId(target.id);
    try {
      const updated = await apiPatch<Booking>(endpoints.bookings.reschedule(target.id), { version: target.version, startAt: selectedSlot });
      replace(updated);
      setSelectedBooking(null);
    } catch (err) {
      setError(errMessage(err, "No se pudo reagendar la reserva."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-medium tracking-tight">Reservas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Revisa, confirma, completa, cancela o reagenda citas del negocio.
        </p>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={reload} className="font-semibold hover:underline">Reintentar</button>
        </div>
      ) : null}

      <Card>
        <CardHeader className="border-b border-border py-4">
          <CardTitle className="text-base">Agenda de reservas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Cliente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Codigo</TableHead>
                <TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-6"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="ml-auto h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : bookings.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">Aun no hay reservas.</TableCell>
                </TableRow>
              ) : (
                bookings.map((booking) => (
                  <TableRow key={booking.id} className={busyId === booking.id ? "opacity-50" : undefined}>
                    <TableCell className="pl-6 font-medium">{booking.customer.firstName} {booking.customer.lastName}</TableCell>
                    <TableCell className="text-muted-foreground">{booking.serviceName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(booking.startAt).toLocaleString("es-CR")}
                    </TableCell>
                    <TableCell><Badge variant={statusVariant[booking.status]}>{statusLabels[booking.status]}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">v{booking.version}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal />
                            <span className="sr-only">Acciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {booking.status === "HELD" || booking.status === "PENDING" ? <DropdownMenuItem onClick={() => lifecycle(booking, "confirm")}><Check />Confirmar</DropdownMenuItem> : null}
                          {booking.status === "CONFIRMED" ? <DropdownMenuItem onClick={() => lifecycle(booking, "complete")}><CheckCheck />Completar</DropdownMenuItem> : null}
                          {booking.status === "CONFIRMED" ? <DropdownMenuItem onClick={() => lifecycle(booking, "noShow")}><UserX />Marcar ausencia</DropdownMenuItem> : null}
                          {booking.status === "HELD" || booking.status === "PENDING" || booking.status === "CONFIRMED" ? <DropdownMenuItem onClick={() => openReschedule(booking)}><CalendarClock />Reagendar</DropdownMenuItem> : null}
                          {booking.status === "HELD" || booking.status === "PENDING" || booking.status === "CONFIRMED" ? <DropdownMenuSeparator /> : null}
                          {booking.status === "HELD" || booking.status === "PENDING" || booking.status === "CONFIRMED" ? <DropdownMenuItem onClick={() => lifecycle(booking, "cancel")} className="text-destructive focus:text-destructive"><X />Cancelar</DropdownMenuItem> : null}
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

      <Modal open={!!selectedBooking} onClose={() => setSelectedBooking(null)} title="Reagendar reserva">
        {selectedBooking ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-4 text-sm">
              <strong className="block">{selectedBooking.customer.firstName} {selectedBooking.customer.lastName}</strong>
              <span className="text-muted-foreground">{selectedBooking.serviceName}</span>
              <span className="mt-1 block text-muted-foreground">
                {new Date(selectedBooking.startAt).toLocaleString("es-CR")}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-slot">Nuevo horario disponible</Label>
              <select id="new-slot" className={selectClass} value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
                <option value="">Selecciona un horario</option>
                {availableSlots.slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {new Intl.DateTimeFormat("es-CR", { timeZone: availableSlots.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(slot))}
                  </option>
                ))}
              </select>
              {slotsLoading ? <p className="text-xs text-muted-foreground">Cargando horarios reales...</p> : null}
              {!slotsLoading && availableSlots.slots.length === 0 ? <p className="text-xs text-muted-foreground">No hay horarios disponibles en los proximos 14 dias.</p> : null}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setSelectedBooking(null)}>Cancelar</Button>
              <Button onClick={rescheduleBooking} disabled={busyId === selectedBooking.id}>Guardar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
