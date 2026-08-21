"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, dayWithSlotsClass } from "@/components/ui/calendar";
import { selectClass } from "@/components/ui/page-header";
import { ErrorBanner, ManagerHeader } from "@/components/admin/manager-ui";
import { apiDelete, apiGet, apiPost, apiPut, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiList, errMessage } from "@/lib/resource";
import type { AvailabilityBlock } from "@/types/availability";

type Location = { locationId: number; name: string };
type HoursApiRow = { dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean };
type DayRow = { dow: number; label: string; isClosed: boolean; openTime: string; closeTime: string };

// dia_semana per db/03-seed-data.sql: 0=Domingo .. 6=Sabado (JS getDay convention).
const WEEK: { label: string; dow: number }[] = [
  { label: "Lunes", dow: 1 },
  { label: "Martes", dow: 2 },
  { label: "Miercoles", dow: 3 },
  { label: "Jueves", dow: 4 },
  { label: "Viernes", dow: 5 },
  { label: "Sabado", dow: 6 },
  { label: "Domingo", dow: 0 }
];

const windows = [
  { label: "1 semana", days: 7 },
  { label: "2 semanas", days: 14 },
  { label: "1 mes", days: 30 }
];

const mockLocations: Location[] = [{ locationId: 1, name: "Sede central" }];

function defaultSchedule(): DayRow[] {
  return WEEK.map(({ label, dow }) => ({
    dow,
    label,
    isClosed: dow === 0 || dow === 6,
    openTime: "09:00",
    closeTime: "17:00"
  }));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  return `${Math.floor(min / 60).toString().padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`;
}
function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function trimTime(t: string): string {
  return t.slice(0, 5);
}
function formatDay(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" });
}

export function AvailabilityManager() {
  const [locations, setLocations] = useState<Location[]>(mockLocations);
  const [locationId, setLocationId] = useState<number>(mockLocations[0].locationId);
  const [schedule, setSchedule] = useState<DayRow[]>(defaultSchedule());
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [windowDays, setWindowDays] = useState(14);

  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [loadingHours, setLoadingHours] = useState(!isMockMode());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // sedes
  useEffect(() => {
    if (isMockMode()) return;
    apiList<Location>(endpoints.locations.list)
      .then((rows) => {
        if (rows.length === 0) return;
        setLocations(rows);
        setLocationId(rows[0].locationId);
      })
      .catch((err) => setError(errMessage(err, "No se pudieron cargar las sedes.")));
  }, []);

  // horario + turnos de la sede seleccionada
  useEffect(() => {
    if (isMockMode()) {
      setSchedule(defaultSchedule());
      setBlocks([]);
      return;
    }
    setLoadingHours(true);
    Promise.all([
      apiGet<HoursApiRow[]>(`${endpoints.businessHours}?locationId=${locationId}`),
      apiList<AvailabilityBlock>(`${endpoints.availabilityBlocks.list}?pageSize=100`)
    ])
      .then(([hours, allBlocks]) => {
        const byDow = new Map(hours.map((h) => [h.dayOfWeek, h]));
        setSchedule(
          WEEK.map(({ label, dow }) => {
            const row = byDow.get(dow);
            return {
              dow,
              label,
              isClosed: row ? row.isClosed : true,
              openTime: trimTime(row?.openTime ?? "") || "09:00",
              closeTime: trimTime(row?.closeTime ?? "") || "17:00"
            };
          })
        );
        setBlocks(allBlocks);
      })
      .catch((err) => setError(errMessage(err, "No se pudo cargar la configuracion.")))
      .finally(() => setLoadingHours(false));
  }, [locationId]);

  function updateDay(dow: number, patch: Partial<DayRow>) {
    setSchedule((cur) => cur.map((d) => (d.dow === dow ? { ...d, ...patch } : d)));
    setNotice(null);
  }

  async function saveAndGenerate() {
    setError(null);
    setNotice(null);

    if (isMockMode()) {
      setNotice("Modo demo: conecta la API para guardar y generar turnos reales.");
      return;
    }

    setBusy(true);
    try {
      // 1) guardar el horario semanal
      await apiPut(endpoints.businessHours, {
        locationId,
        hours: schedule.map((d) => ({
          dayOfWeek: d.dow,
          openTime: d.isClosed ? null : d.openTime,
          closeTime: d.isClosed ? null : d.closeTime,
          isClosed: d.isClosed
        }))
      });

      // 2) planear los turnos de la ventana, saltando lo que ya paso
      const now = new Date();
      const byDow = new Map(schedule.map((d) => [d.dow, d]));
      const existing = new Set(blocks.map((b) => `${b.blockDate}T${trimTime(b.startTime)}`));
      const plan: { blockDate: string; startTime: string; endTime: string }[] = [];

      for (let i = 0; i < windowDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const day = byDow.get(d.getDay());
        if (!day || day.isClosed) continue;
        const isoDate = toIsoDate(d);
        const openMin = toMinutes(day.openTime);
        const closeMin = toMinutes(day.closeTime);
        for (let t = openMin; t + durationMinutes <= closeMin; t += durationMinutes + breakMinutes) {
          const start = toHHMM(t);
          const slotStart = new Date(`${isoDate}T${start}:00`);
          if (slotStart <= now) continue; // nunca en el pasado
          if (existing.has(`${isoDate}T${start}`)) continue; // ya existe
          plan.push({ blockDate: isoDate, startTime: start, endTime: toHHMM(t + durationMinutes) });
        }
      }

      if (plan.length === 0) {
        setNotice("Horario guardado. No habia turnos nuevos para generar en la ventana elegida.");
        return;
      }

      setProgress({ done: 0, total: plan.length });
      const created: AvailabilityBlock[] = [];
      for (const slot of plan) {
        try {
          const b = await apiPost<AvailabilityBlock>(endpoints.availabilityBlocks.list, {
            locationId,
            blockDate: slot.blockDate,
            startTime: slot.startTime,
            endTime: slot.endTime
          });
          created.push(b);
        } catch {
          // un turno invalido/duplicado no aborta el lote
        }
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }

      setBlocks((cur) => [...cur, ...created]);
      setNotice(`Horario guardado y ${created.length} turno(s) publicado(s).`);
    } catch (err) {
      setError(errMessage(err, "No se pudo guardar la disponibilidad."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function deleteBlock(block: AvailabilityBlock) {
    if (isMockMode()) return;
    setError(null);
    try {
      await apiDelete(endpoints.availabilityBlocks.byId(block.availabilityBlockId));
      setBlocks((cur) => cur.filter((b) => b.availabilityBlockId !== block.availabilityBlockId));
    } catch (err) {
      setError(errMessage(err, "No se pudo eliminar el turno."));
    }
  }

  // turnos futuros agrupados por dia
  const byDate = useMemo(() => {
    const now = new Date();
    const map = new Map<string, AvailabilityBlock[]>();
    for (const b of blocks) {
      if (new Date(`${b.blockDate}T${trimTime(b.startTime)}:00`) <= now) continue; // oculta lo pasado
      const list = map.get(b.blockDate) ?? [];
      list.push(b);
      map.set(b.blockDate, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [blocks]);

  const daysWithSlots = useMemo(() => [...byDate.keys()].map(parseIsoDate), [byDate]);
  const selectedIso = selectedDate ? toIsoDate(selectedDate) : undefined;
  const slotsForDay = selectedIso ? byDate.get(selectedIso) ?? [] : [];
  const totalFuture = [...byDate.values()].reduce((n, l) => n + l.length, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ManagerHeader
        title="Disponibilidad"
        subtitle="Define tu horario de atencion y publica los turnos que tus clientes podran reservar, todo en un solo lugar."
      />

      {error ? <ErrorBanner message={error} onRetry={() => setError(null)} /> : null}
      {notice ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Check className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      ) : null}

      {/* 1. horario semanal */}
      <Card>
        <CardHeader className="border-b border-border py-4">
          <CardTitle className="text-base">Horario de atencion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="loc">Sede</Label>
            <select id="loc" className={selectClass} value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
              {locations.map((l) => (
                <option key={l.locationId} value={l.locationId}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border">
            {loadingHours ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Cargando horario...</p>
            ) : (
              schedule.map((item) => (
                <div key={item.dow} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <span className="w-24 shrink-0 text-sm font-medium">{item.label}</span>
                  <button
                    type="button"
                    onClick={() => updateDay(item.dow, { isClosed: !item.isClosed })}
                    className={`inline-flex h-7 w-24 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                      item.isClosed
                        ? "border-input text-muted-foreground hover:bg-accent"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }`}
                  >
                    {item.isClosed ? "Cerrado" : "Abierto"}
                  </button>
                  {item.isClosed ? (
                    <span className="text-sm text-muted-foreground">No se atiende este dia</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input type="time" value={item.openTime} onChange={(e) => updateDay(item.dow, { openTime: e.target.value })} className="h-9 w-36" />
                      <span className="text-sm text-muted-foreground">a</span>
                      <Input type="time" value={item.closeTime} onChange={(e) => updateDay(item.dow, { closeTime: e.target.value })} className="h-9 w-36" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. generar turnos */}
      <Card>
        <CardHeader className="border-b border-border py-4">
          <CardTitle className="text-base">Publicar turnos reservables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dur">Duracion del turno</Label>
              <select id="dur" className={selectClass} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
                {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brk">Descanso entre turnos</Label>
              <select id="brk" className={selectClass} value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))}>
                {[0, 5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Abrir reservas para</Label>
              <div className="flex gap-1.5">
                {windows.map((w) => (
                  <button
                    key={w.days}
                    type="button"
                    onClick={() => setWindowDays(w.days)}
                    className={`h-9 flex-1 rounded-md border text-sm font-medium transition-colors ${
                      windowDays === w.days ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-xs text-muted-foreground">
              Un solo paso: guarda tu horario y crea los turnos de los proximos{" "}
              <span className="font-medium text-foreground">{windowDays} dias</span> en los dias abiertos. Nunca se crean turnos en el pasado.
            </p>
            <Button onClick={saveAndGenerate} disabled={busy || loadingHours} size="lg">
              <Sparkles />
              {busy ? (progress ? `Generando ${progress.done}/${progress.total}...` : "Guardando...") : "Guardar y generar turnos"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. turnos publicados (calendario) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border py-4">
          <CardTitle className="text-base">Turnos publicados</CardTitle>
          <span className="text-sm text-muted-foreground">{totalFuture} turno(s) proximos</span>
        </CardHeader>
        <CardContent className="p-0">
          {daysWithSlots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
              <CalendarClock className="h-6 w-6 opacity-40" />
              <p className="max-w-xs text-sm">Aun no hay turnos publicados. Configura tu horario arriba y presiona "Guardar y generar turnos".</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={{ before: today }}
                modifiers={{ hasSlots: daysWithSlots }}
                modifiersClassNames={{ hasSlots: dayWithSlotsClass }}
                defaultMonth={daysWithSlots[0]}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1 sm:border-l sm:border-border sm:pl-6">
                <p className="text-sm font-medium capitalize">{selectedIso ? formatDay(selectedIso) : "Elige un dia con cupo"}</p>
                {!selectedIso ? (
                  <p className="mt-3 text-sm text-muted-foreground">Los dias en azul tienen turnos disponibles.</p>
                ) : slotsForDay.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Este dia no tiene turnos.</p>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slotsForDay.map((b) => (
                      <div
                        key={b.availabilityBlockId}
                        className={`group relative rounded-md border px-2 py-2 text-center text-sm font-medium ${
                          b.isReserved ? "border-border bg-muted text-muted-foreground" : "border-input"
                        }`}
                      >
                        {trimTime(b.startTime)}
                        {b.isReserved ? (
                          <span className="mt-0.5 block text-[10px] font-normal">reservado</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => deleteBlock(b)}
                            aria-label="Eliminar turno"
                            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive group-hover:flex"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
