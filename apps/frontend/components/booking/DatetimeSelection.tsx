"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";

export function DatetimeSelection({ slug, slots }: { slug: string; slots: string[] }) {
  const params = useSearchParams();
  const serviceId = params.get("service") ?? "";
  const locationId = params.get("location") ?? "";
  const [selected, setSelected] = useState("");
  const grouped = useMemo(() => slots.reduce<Record<string, string[]>>((result, slot) => { const day = slot.slice(0, 10); (result[day] ??= []).push(slot); return result; }, {}), [slots]);
  return <div><h1 className="font-serif text-3xl font-medium tracking-tight">Escoge fecha y hora</h1><p className="mt-2 text-muted-foreground">Los horarios se calculan en tiempo real.</p>
    {slots.length === 0 ? <div className="mt-6 rounded-xl border p-6 text-center text-sm text-muted-foreground">No hay horarios disponibles para esta sede.</div> : <div className="mt-6 space-y-5">{Object.entries(grouped).map(([day, daySlots]) => <section key={day}><h2 className="mb-2 font-medium capitalize">{new Date(`${day}T12:00:00`).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" })}</h2><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{daySlots.map((slot) => <button key={slot} type="button" aria-pressed={selected === slot} onClick={() => setSelected(slot)} className={`h-10 rounded-md border text-sm ${selected === slot ? "border-ink bg-ink text-ink-foreground" : "bg-card"}`}>{new Date(slot).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}</button>)}</div></section>)}</div>}
    <div className="mt-8 flex justify-between"><Link href={`/book/${slug}/service`} className={buttonVariants({ variant: "outline" })}>Volver</Link>{selected ? <Link href={`/book/${slug}/customer?service=${encodeURIComponent(serviceId)}&startAt=${encodeURIComponent(selected)}&location=${encodeURIComponent(locationId)}`} className={buttonVariants()}>Continuar</Link> : <span className={`${buttonVariants()} pointer-events-none opacity-50`}>Selecciona un horario</span>}</div>
  </div>;
}
