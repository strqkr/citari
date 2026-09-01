"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export function TrackingActionForm({ code, version, action }: { code: string; version: number; action: "cancel" | "reschedule" }) {
  const router = useRouter();
  const [startAt, setStartAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const path = action === "cancel" ? endpoints.track.cancel(code) : endpoints.track.reschedule(code);
      await apiPost(path, {
        version,
        ...(action === "reschedule" ? { startAt: new Date(startAt).toISOString() } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {})
      });
      router.push(`/track/${encodeURIComponent(code)}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail || caught.title : "No se pudo actualizar la reserva.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-4">
    {action === "reschedule" ? <div className="space-y-2"><Label htmlFor="startAt">Nueva fecha y hora</Label><Input id="startAt" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /></div> : null}
    <div className="space-y-2"><Label htmlFor="reason">Motivo opcional</Label><Input id="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" variant={action === "cancel" ? "destructive" : "default"} disabled={busy}>{busy ? "Guardando..." : action === "cancel" ? "Cancelar reserva" : "Confirmar nuevo horario"}</Button>
  </form>;
}
