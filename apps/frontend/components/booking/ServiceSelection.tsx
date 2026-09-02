"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { Service } from "@/types/service";

type PublicLocation = { id: string; name: string; addressLine1: string | null; province: string | null; canton: string | null; isMain: boolean };

export function ServiceSelection({ slug, services, locations }: { slug: string; services: Service[]; locations: PublicLocation[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(locations.length === 1 ? locations[0]?.id ?? null : null);
  const selected = services.find((service) => service.id === selectedId);

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium tracking-tight">Elige un servicio</h1>
      <p className="mt-2 text-muted-foreground">
        Selecciona el servicio que quieres reservar. Escoges fecha y hora en el siguiente paso.
      </p>

      <div className="mt-6 space-y-3">
        {services.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Este negocio aun no tiene servicios disponibles.
          </div>
        ) : (
          services.map((service) => {
            const isSelected = selectedId === service.id;
            return (
              <button
                type="button"
                key={service.id}
                onClick={() => setSelectedId(service.id)}
                aria-pressed={isSelected}
                className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:bg-accent/60"
                }`}
              >
                <div className="min-w-0">
                  <strong className="block font-semibold">{service.name}</strong>
                  {service.description ? (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {service.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {service.durationMinutes} min
                  </span>
                  {service.showPrice && service.price ? (
                    <span className="font-semibold">CRC {service.price}</span>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-medium">Elige una sede</h2>
        <p className="mt-1 text-sm text-muted-foreground">La disponibilidad y la zona horaria dependen de la sede.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {locations.map((location) => <button type="button" key={location.id} aria-pressed={selectedLocationId === location.id} onClick={() => setSelectedLocationId(location.id)} className={`min-h-20 rounded-xl border p-4 text-left ${selectedLocationId === location.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-accent/60"}`}><strong className="block">{location.name}</strong><span className="mt-1 block text-sm text-muted-foreground">{[location.addressLine1, location.canton, location.province].filter(Boolean).join(", ") || "Dirección por confirmar"}</span></button>)}
          {locations.length === 0 ? <div role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Este negocio aún no tiene una sede disponible para reservas.</div> : null}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Link href={`/book/${slug}`} className={buttonVariants({ variant: "outline" })}>
          Volver
        </Link>
        {selected && selectedLocationId ? (
          <Link
            href={`/book/${slug}/datetime?service=${selected.id}&location=${selectedLocationId}`}
            className={buttonVariants()}
          >
            Continuar
          </Link>
        ) : (
          <span className={`${buttonVariants()} pointer-events-none opacity-50`}>
            {!selected ? "Selecciona un servicio" : "Selecciona una sede"}
          </span>
        )}
      </div>
    </div>
  );
}
