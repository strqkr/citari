"use client";

import { useState } from "react";
import { CalendarClock, Check, CheckCheck, MoreHorizontal, X } from "lucide-react";
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
import { apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { errMessage, useResource } from "@/lib/resource";
import { mockAvailability, mockBookings } from "@/lib/mock-data";
import type { AvailabilityBlock } from "@/types/availability";
import type { Booking } from "@/types/booking";

const statusLabels: Record<Booking["status"], string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  rescheduled: "Reagendada"
};

const statusVariant: Record<Booking["status"], "brand" | "success" | "muted" | "destructive"> = {
  pending: "muted",
  confirmed: "brand",
  cancelled: "destructive",
  completed: "success",
  rescheduled: "brand"
};

export function BookingsManager() {
  const { items: bookings, setItems: setBookings, loading, error, setError, reload } = useResource<Booking>(
    endpoints.bookings.list,
    mockBookings
  );
  const { items: availability } = useResource<AvailabilityBlock>(endpoints.availabilityBlocks.list, mockAvailability);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  function replace(updated: Booking) {
    setBookings((current) => current.map((b) => (b.bookingId === updated.bookingId ? updated : b)));
  }

  async function lifecycle(booking: Booking, action: "confirm" | "complete" | "cancel") {
    const status: Booking["status"] = action === "confirm" ? "confirmed" : action === "complete" ? "completed" : "cancelled";
    if (isMockMode()) {
      replace({ ...booking, status });
      return;
    }
    setError(null);
    setBusyId(booking.bookingId);
    try {
      const updated = await apiPost<Booking>(endpoints.bookings[action](booking.bookingId));
      replace(updated);
    } catch (err) {
      setError(errMessage(err, "No se pudo actualizar la reserva."));
    } finally {
      setBusyId(null);
    }
  }

  function openReschedule(booking: Booking) {
    setSelectedBooking(booking);
    setSelectedSlot("");
  }

  async function rescheduleBooking() {
    if (!selectedBooking || !selectedSlot) return;
    const target = selectedBooking;
    if (isMockMode()) {
      const slot = availability.find((block) => String(block.availabilityBlockId) === selectedSlot);
      if (!slot) return;
      replace({ ...target, bookingDate: slot.blockDate, startTime: slot.startTime, status: "rescheduled" });
      setSelectedBooking(null);
      return;
    }
    setError(null);
    setBusyId(target.bookingId);
    try {
      const updated = await apiPost<Booking>(endpoints.bookings.reschedule(target.bookingId), {
        newAvailabilityBlockId: Number(selectedSlot)
      });
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
                  <TableRow key={booking.bookingId} className={busyId === booking.bookingId ? "opacity-50" : undefined}>
                    <TableCell className="pl-6 font-medium">{booking.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">{booking.serviceName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {booking.bookingDate} · <span className="font-mono text-xs">{booking.startTime.slice(0, 5)}</span>
                    </TableCell>
                    <TableCell><Badge variant={statusVariant[booking.status]}>{statusLabels[booking.status]}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{booking.trackingCode}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal />
                            <span className="sr-only">Acciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => lifecycle(booking, "confirm")}><Check />Confirmar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => lifecycle(booking, "complete")}><CheckCheck />Completar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openReschedule(booking)}><CalendarClock />Reagendar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => lifecycle(booking, "cancel")} className="text-destructive focus:text-destructive">
                            <X />Cancelar
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

      <Modal open={!!selectedBooking} onClose={() => setSelectedBooking(null)} title="Reagendar reserva">
        {selectedBooking ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-4 text-sm">
              <strong className="block">{selectedBooking.customerName}</strong>
              <span className="text-muted-foreground">{selectedBooking.serviceName}</span>
              <span className="mt-1 block text-muted-foreground">
                {selectedBooking.bookingDate} · {selectedBooking.startTime.slice(0, 5)}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-slot">Nuevo horario disponible</Label>
              <select id="new-slot" className={selectClass} value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
                <option value="">Selecciona un horario</option>
                {availability.filter((b) => !b.isReserved).map((block) => (
                  <option key={block.availabilityBlockId} value={block.availabilityBlockId}>
                    {block.blockDate} · {block.startTime} a {block.endTime}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setSelectedBooking(null)}>Cancelar</Button>
              <Button onClick={rescheduleBooking} disabled={busyId === selectedBooking.bookingId}>Guardar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
