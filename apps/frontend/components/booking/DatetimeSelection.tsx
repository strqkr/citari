"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, apiPostIdempotent } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type HoldResponse = { holdToken: string; expiresAt: string };

function dateKey(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function DatetimeSelection({ slug, slots, timezone }: { slug: string; slots: string[]; timezone: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const serviceId = params.get("service") ?? "";
  const locationId = params.get("location") ?? "";
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ slot: string; key: string } | null>(null);
  const grouped = useMemo(() => slots.reduce<Record<string, string[]>>((result, slot) => { const day = dateKey(slot, timezone); (result[day] ??= []).push(slot); return result; }, {}), [slots, timezone]);

  function select(slot: string) {
    setSelected(slot);
    setError(null);
    attempt.current = { slot, key: crypto.randomUUID() };
  }

  async function continueToCustomer() {
    if (!selected || !serviceId || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const current = attempt.current?.slot === selected ? attempt.current : { slot: selected, key: crypto.randomUUID() };
      attempt.current = current;
      const hold = await apiPostIdempotent<HoldResponse>(endpoints.public.holds(slug), { serviceId, locationId, startAt: selected }, current.key);
      const query = new URLSearchParams({ service: serviceId, startAt: selected, location: locationId });
      const fragment = new URLSearchParams({ hold: hold.holdToken, expires: hold.expiresAt });
      router.push(`/book/${slug}/customer?${query.toString()}#${fragment.toString()}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setError("Ese horario acaba de ser tomado. Elige otro disponible.");
      else if (caught instanceof ApiError && caught.status === 429) setError("Hay demasiados intentos. Espera unos minutos y vuelve a intentarlo.");
      else setError("No pudimos retener el horario. Revisa tu conexión e intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return <div>
    <h1 className="font-serif text-3xl font-medium tracking-tight">Escoge fecha y hora</h1>
    <p className="mt-2 text-muted-foreground">Al continuar, reservaremos el horario durante 10 minutos mientras completas tus datos.</p>
    {slots.length === 0 ? <div className="mt-6 rounded-xl border p-6 text-center text-sm text-muted-foreground">No hay horarios disponibles para esta sede.</div> : <div className="mt-6 space-y-5">{Object.entries(grouped).map(([day, daySlots]) => <section key={day}><h2 className="mb-2 font-medium capitalize">{new Intl.DateTimeFormat("es-CR", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date(daySlots[0]))}</h2><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{daySlots.map((slot) => <button key={slot} type="button" aria-pressed={selected === slot} onClick={() => select(slot)} className={`min-h-11 rounded-md border text-sm ${selected === slot ? "border-ink bg-ink text-ink-foreground" : "bg-card"}`}>{new Intl.DateTimeFormat("es-CR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(slot))}</button>)}</div></section>)}</div>}
    {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
    <div className="mt-8 flex justify-between"><Link href={`/book/${slug}/service`} className={buttonVariants({ variant: "outline" })}>Volver</Link><Button type="button" disabled={!selected || loading} onClick={continueToCustomer}>{loading ? "Reteniendo..." : selected ? "Continuar" : "Selecciona un horario"}</Button></div>
  </div>;
}
