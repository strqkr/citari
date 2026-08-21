"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { BookingShell } from "@/components/layout/BookingShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ApiError, apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { mockAvailability } from "@/lib/mock-data";

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayLabel(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" });
}

export default function TrackReschedulePage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? "";
  const slots = mockAvailability.filter((block) => !block.isReserved);

  const byDate = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const block of slots) {
      const list = map.get(block.blockDate) ?? [];
      list.push(block);
      map.set(block.blockDate, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const availableDates = useMemo(() => [...byDate.keys()].sort().map(parseIsoDate), [byDate]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(availableDates[0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIso = selectedDate ? toIsoDate(selectedDate) : undefined;
  const slotsForDay = selectedIso ? byDate.get(selectedIso) ?? [] : [];

  function pickDate(date: Date | undefined) {
    setSelectedDate(date);
    setSelected(null);
  }

  async function submit() {
    if (!selected) return;
    setError(null);
    if (isMockMode()) {
      setDone(true);
      return;
    }
    setLoading(true);
    try {
      await apiPost(endpoints.track.reschedule(code), { newAvailabilityBlockId: selected });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo reagendar la reserva.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <BookingShell>
      <div className="rounded-3xl border border-border bg-card p-8 shadow-soft">
        {done ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
              Reserva reagendada
            </span>
            <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight">Nuevo horario confirmado</h1>
            <p className="mt-2 text-muted-foreground">
              Tu reserva <span className="font-mono">{code}</span> quedo reagendada.
            </p>
            <div className="mt-6">
              <Link href={`/track/${code}`} className={buttonVariants()}>
                Ver detalle
              </Link>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
              Reagendar reserva
            </span>
            <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight">Elige un nuevo horario</h1>
            <p className="mt-2 text-muted-foreground">Solo se muestran horarios disponibles.</p>

            <div className="mt-6 flex flex-col gap-6 rounded-xl border border-border bg-background p-4 sm:flex-row sm:p-5">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={pickDate}
                disabled={(date) => !byDate.has(toIsoDate(date))}
                defaultMonth={availableDates[0]}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1 sm:border-l sm:border-border sm:pl-6">
                <div className="flex items-center gap-2 text-sm font-medium capitalize">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  {selectedIso ? formatDayLabel(selectedIso) : "Elige un dia"}
                </div>
                {slotsForDay.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Este dia no tiene horarios disponibles.</p>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slotsForDay.map((slot) => {
                      const isSelected = selected === slot.availabilityBlockId;
                      return (
                        <button
                          type="button"
                          key={slot.availabilityBlockId}
                          onClick={() => setSelected(slot.availabilityBlockId)}
                          className={`rounded-md border px-2 py-2 text-center text-sm font-medium transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                              : "border-input bg-card text-foreground hover:bg-accent"
                          }`}
                        >
                          {slot.startTime.slice(0, 5)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/track/${code}`} className={buttonVariants({ variant: "outline" })}>
                Volver al detalle
              </Link>
              <Button onClick={submit} disabled={!selected || loading}>
                {loading ? "Reagendando..." : "Confirmar nuevo horario"}
              </Button>
            </div>
          </>
        )}
      </div>
    </BookingShell>
  );
}
