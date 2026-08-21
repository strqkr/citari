"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Calendar, dayWithSlotsClass } from "@/components/ui/calendar";
import type { AvailabilityBlock } from "@/types/availability";

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

export function DatetimeSelection({ slug, blocks }: { slug: string; blocks: AvailabilityBlock[] }) {
  const searchParams = useSearchParams();
  const serviceId = searchParams.get("service") || "";

  // `now` se resuelve SOLO tras montar en el cliente. Durante el SSR y la
  // primera hidratacion vale null, asi el render es identico en servidor y
  // cliente (nada de hora actual, que difiere por zona horaria/tiempo y rompe
  // la hidratacion). Ya montado, se filtra lo pasado.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  // Solo turnos libres; ya montado, ademas descarta los que ya pasaron.
  const available = useMemo(
    () =>
      blocks.filter(
        (block) =>
          !block.isReserved &&
          (now === null || new Date(`${block.blockDate}T${block.startTime.slice(0, 5)}:00`).getTime() > now)
      ),
    [blocks, now]
  );

  const today = useMemo(() => {
    if (now === null) return undefined;
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const byDate = useMemo(() => {
    const map = new Map<string, AvailabilityBlock[]>();
    for (const block of available) {
      const list = map.get(block.blockDate) ?? [];
      list.push(block);
      map.set(block.blockDate, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [available]);

  const availableDates = useMemo(() => [...byDate.keys()].sort().map(parseIsoDate), [byDate]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

  // Selecciona el primer dia disponible recien en el cliente (evita el mismatch).
  useEffect(() => {
    if (now !== null && !selectedDate && availableDates.length > 0) setSelectedDate(availableDates[0]);
  }, [now, availableDates, selectedDate]);

  const selectedIso = selectedDate ? toIsoDate(selectedDate) : undefined;
  const slotsForDay = selectedIso ? byDate.get(selectedIso) ?? [] : [];
  const selectedBlock = slotsForDay.find((b) => b.availabilityBlockId === selectedBlockId);

  function pickDate(date: Date | undefined) {
    setSelectedDate(date);
    setSelectedBlockId(null);
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium tracking-tight">Escoge fecha y hora</h1>
      <p className="mt-2 text-muted-foreground">Solo se muestran horarios disponibles para reservar.</p>

      <div className="mt-6">
        {available.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No hay horarios disponibles por ahora.
          </div>
        ) : (
          <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-4 sm:flex-row sm:p-5">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={pickDate}
              disabled={
                today
                  ? [{ before: today }, (date) => !byDate.has(toIsoDate(date))]
                  : (date) => !byDate.has(toIsoDate(date))
              }
              modifiers={{ hasSlots: availableDates }}
              modifiersClassNames={{ hasSlots: dayWithSlotsClass }}
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
                  {slotsForDay.map((block) => {
                    const selected = selectedBlockId === block.availabilityBlockId;
                    return (
                      <button
                        type="button"
                        key={block.availabilityBlockId}
                        onClick={() => setSelectedBlockId(block.availabilityBlockId)}
                        aria-pressed={selected}
                        className={`h-10 rounded-md border text-center text-sm font-medium transition-colors ${
                          selected
                            ? "border-ink bg-ink text-ink-foreground"
                            : "border-input bg-card text-foreground hover:border-ink/40 hover:bg-accent"
                        }`}
                      >
                        {block.startTime.slice(0, 5)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Link href={`/book/${slug}/service`} className={buttonVariants({ variant: "outline" })}>
          Volver
        </Link>
        {selectedBlockId ? (
          <Link
            href={`/book/${slug}/customer?service=${serviceId}&block=${selectedBlockId}&location=${selectedBlock?.locationId ?? ""}`}
            className={buttonVariants()}
          >
            Continuar
          </Link>
        ) : (
          <span className={`${buttonVariants()} pointer-events-none opacity-50`}>Selecciona un horario</span>
        )}
      </div>
    </div>
  );
}
