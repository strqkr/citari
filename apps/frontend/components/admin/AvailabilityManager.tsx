"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner, ManagerHeader } from "@/components/admin/manager-ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiList, errMessage } from "@/lib/resource";
import type { AvailabilityBlock } from "@/types/availability";

type Hour = { dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean };
type Location = { id: string; name: string; businessHours: Hour[] };
const labels = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const defaults = () => labels.map((_, dayOfWeek) => ({ dayOfWeek, isClosed: dayOfWeek === 0 || dayOfWeek === 6, openTime: "09:00", closeTime: "17:00" }));
const isoTime = (value: string | null) => value ? new Date(value).toISOString().slice(11, 16) : "09:00";

export function AvailabilityManager() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [hours, setHours] = useState(defaults());
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { apiList<Location>(endpoints.locations.list).then((rows) => { setLocations(rows); setLocationId(rows[0]?.id ?? ""); }).catch((e) => setError(errMessage(e, "No se pudieron cargar las sedes."))); }, []);
  useEffect(() => {
    const location = locations.find((item) => item.id === locationId);
    const map = new Map(location?.businessHours.map((item) => [item.dayOfWeek, item]));
    setHours(labels.map((_, dayOfWeek) => { const row = map.get(dayOfWeek); return row ? { ...row, openTime: isoTime(row.openTime), closeTime: isoTime(row.closeTime) } : defaults()[dayOfWeek]; }));
    if (!locationId) return;
    const from = new Date().toISOString(), to = new Date(Date.now() + 90 * 86400000).toISOString();
    apiGet<AvailabilityBlock[]>(`${endpoints.availabilityBlocks.list}?locationId=${locationId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(setBlocks).catch((e) => setError(errMessage(e, "No se pudieron cargar los bloqueos.")));
  }, [locationId, locations]);

  async function saveHours() {
    if (!locationId) return;
    setBusy(true); setError(null);
    try { await apiPut(endpoints.businessHours(locationId), { hours: hours.map((h) => ({ ...h, openTime: h.isClosed ? null : h.openTime, closeTime: h.isClosed ? null : h.closeTime })) }); }
    catch (e) { setError(errMessage(e, "No se pudo guardar el horario.")); } finally { setBusy(false); }
  }
  async function createBlock() {
    if (!locationId || !startsAt || !endsAt) return;
    setBusy(true); setError(null);
    try { const created = await apiPost<AvailabilityBlock>(endpoints.availabilityBlocks.list, { locationId, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), reason: reason || undefined }); setBlocks((current) => [...current, created]); setStartsAt(""); setEndsAt(""); setReason(""); }
    catch (e) { setError(errMessage(e, "No se pudo crear el bloqueo.")); } finally { setBusy(false); }
  }
  async function remove(block: AvailabilityBlock) { try { await apiDelete(endpoints.availabilityBlocks.byId(block.id)); setBlocks((current) => current.filter((item) => item.id !== block.id)); } catch (e) { setError(errMessage(e, "No se pudo eliminar el bloqueo.")); } }

  return <div className="mx-auto max-w-5xl space-y-6">
    <ManagerHeader title="Disponibilidad" subtitle="Configura horarios de atencion y bloquea periodos no reservables." />
    {error ? <ErrorBanner message={error} onRetry={() => setError(null)} /> : null}
    <Card><CardHeader><CardTitle className="text-base">Horario semanal</CardTitle></CardHeader><CardContent className="space-y-4">
      <div><Label htmlFor="location">Sede</Label><select id="location" className="mt-2 h-9 w-full rounded-md border bg-card px-3" value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
      {hours.map((hour) => <div key={hour.dayOfWeek} className="grid items-center gap-2 sm:grid-cols-[8rem_6rem_1fr_1fr]"><span>{labels[hour.dayOfWeek]}</span><label className="text-sm"><input type="checkbox" checked={!hour.isClosed} onChange={(e) => setHours((rows) => rows.map((r) => r.dayOfWeek === hour.dayOfWeek ? { ...r, isClosed: !e.target.checked } : r))} /> Abierto</label><Input aria-label={`Apertura ${labels[hour.dayOfWeek]}`} type="time" disabled={hour.isClosed} value={hour.openTime ?? "09:00"} onChange={(e) => setHours((rows) => rows.map((r) => r.dayOfWeek === hour.dayOfWeek ? { ...r, openTime: e.target.value } : r))} /><Input aria-label={`Cierre ${labels[hour.dayOfWeek]}`} type="time" disabled={hour.isClosed} value={hour.closeTime ?? "17:00"} onChange={(e) => setHours((rows) => rows.map((r) => r.dayOfWeek === hour.dayOfWeek ? { ...r, closeTime: e.target.value } : r))} /></div>)}
      <Button onClick={saveHours} disabled={busy || !locationId}>Guardar horario</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Bloqueos de agenda</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><div><Label htmlFor="starts">Desde</Label><Input id="starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div><div><Label htmlFor="ends">Hasta</Label><Input id="ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div><div><Label htmlFor="reason">Motivo</Label><Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div></div><Button onClick={createBlock} disabled={busy || !locationId}><Plus />Agregar bloqueo</Button>
      {blocks.length === 0 ? <p className="text-sm text-muted-foreground">No hay bloqueos futuros.</p> : <ul className="divide-y">{blocks.map((block) => <li key={block.id} className="flex items-center justify-between py-3 text-sm"><span>{new Date(block.startsAt).toLocaleString("es-CR")} – {new Date(block.endsAt).toLocaleString("es-CR")} {block.reason ? `· ${block.reason}` : ""}</span><Button variant="ghost" size="icon" onClick={() => remove(block)} aria-label="Eliminar bloqueo"><Trash2 /></Button></li>)}</ul>}
    </CardContent></Card>
  </div>;
}
