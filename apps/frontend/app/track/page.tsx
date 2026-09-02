"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BookingShell } from "@/components/layout/BookingShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type TrackedBooking = {
  id: string;
  version: number;
  status: string;
  startAt: string;
  endAt: string;
  serviceName: string;
  location: { name: string };
  tenant: { name: string; timezone: string; locale: string };
};
type Action = "cancel" | "reschedule" | null;

function errorMessage(caught: unknown): string {
  if (!(caught instanceof ApiError)) return "No se pudo contactar el servicio. Intenta nuevamente.";
  if (caught.status === 404 || caught.status === 410) return "El acceso no existe, venció o fue revocado.";
  if (caught.status === 409) return "La reserva cambió mientras la consultabas. Actualízala e intenta de nuevo.";
  if (caught.status === 422) return caught.detail || "La operación ya no está permitida para esta reserva.";
  if (caught.status === 429) return "Hay demasiados intentos. Espera unos minutos antes de continuar.";
  if (caught.status === 503) return "El servicio no está disponible temporalmente.";
  return caught.detail || caught.title;
}

export default function TrackLookupPage() {
  const [token, setToken] = useState("");
  const [booking, setBooking] = useState<TrackedBooking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [startAt, setStartAt] = useState("");

  const lookup = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setLoading(true);
    setError(null);
    setAction(null);
    try {
      setBooking(await apiPost<TrackedBooking>(endpoints.track.lookup, { token: normalized }));
      setToken(normalized);
    } catch (caught) {
      setBooking(null);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    history.replaceState(null, "", window.location.pathname);
    if (fragmentToken) {
      setToken(fragmentToken);
      void lookup(fragmentToken);
    }
  }, [lookup]);

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookup(token);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking || !action) return;
    setLoading(true);
    setError(null);
    try {
      const path = action === "cancel" ? endpoints.track.cancelSafe : endpoints.track.rescheduleSafe;
      await apiPost(path, {
        token,
        version: booking.version,
        ...(action === "reschedule" ? { startAt: new Date(startAt).toISOString() } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {})
      });
      setReason("");
      setStartAt("");
      await lookup(token);
    } catch (caught) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  }

  const mutable = booking && ["HELD", "PENDING", "CONFIRMED"].includes(booking.status);
  return <BookingShell>
    <div className="mx-auto w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Seguimiento privado</p>
      <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">Consulta tu cita</h1>
      <p className="mt-3 text-muted-foreground">El acceso se envía dentro del cuerpo cifrado de la solicitud y se elimina de la barra del navegador.</p>
      <form onSubmit={submitLookup} className="mt-7 space-y-3">
        <Label htmlFor="tracking-token">Acceso de seguimiento</Label>
        <Input id="tracking-token" type="password" value={token} onChange={(event) => { setToken(event.target.value); setBooking(null); }} autoComplete="off" required aria-describedby="tracking-help" />
        <p id="tracking-help" className="text-xs text-muted-foreground">Pega el acceso exactamente como lo recibiste; distingue mayúsculas y minúsculas.</p>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Consultando..." : "Consultar reserva"}</Button>
      </form>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {booking ? <div className="mt-7" aria-live="polite">
        <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl">Detalle de tu cita</h2><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{booking.status}</span></div>
        <dl className="mt-4 divide-y divide-border">
          {[
            ["Negocio", booking.tenant.name],
            ["Servicio", booking.serviceName],
            ["Fecha", new Date(booking.startAt).toLocaleString("es-CR", { timeZone: booking.tenant.timezone })],
            ["Sede", booking.location.name]
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}
        </dl>
        {mutable ? <div className="mt-5 flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setAction(action === "reschedule" ? null : "reschedule")}>Reagendar</Button><Button type="button" variant="destructive" onClick={() => setAction(action === "cancel" ? null : "cancel")}>Cancelar</Button></div> : null}
        {action ? <form onSubmit={submitAction} className="mt-5 space-y-4 rounded-xl border p-4">
          <h3 className="font-semibold">{action === "cancel" ? "Cancelar reserva" : "Elegir nuevo horario"}</h3>
          {action === "reschedule" ? <div className="space-y-2"><Label htmlFor="new-start">Nueva fecha y hora</Label><Input id="new-start" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /></div> : <p className="text-sm text-muted-foreground">Esta acción libera el horario y no puede deshacerse desde este portal.</p>}
          <div className="space-y-2"><Label htmlFor="tracking-reason">Motivo opcional</Label><Input id="tracking-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></div>
          <div className="flex gap-3"><Button type="submit" variant={action === "cancel" ? "destructive" : "default"} disabled={loading}>{loading ? "Guardando..." : "Confirmar"}</Button><Button type="button" variant="ghost" onClick={() => setAction(null)}>Cerrar</Button></div>
        </form> : null}
      </div> : null}
    </div>
  </BookingShell>;
}
