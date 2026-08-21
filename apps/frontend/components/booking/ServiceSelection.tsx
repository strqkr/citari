"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { Service } from "@/types/service";

export function ServiceSelection({ slug, services }: { slug: string; services: Service[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = services.find((service) => service.serviceId === selectedId);

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
            const isSelected = selectedId === service.serviceId;
            return (
              <button
                type="button"
                key={service.serviceId}
                onClick={() => setSelectedId(service.serviceId)}
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

      <div className="mt-8 flex items-center justify-between gap-3">
        <Link href={`/book/${slug}`} className={buttonVariants({ variant: "outline" })}>
          Volver
        </Link>
        {selected ? (
          <Link
            href={`/book/${slug}/datetime?service=${selected.serviceId}`}
            className={buttonVariants()}
          >
            Continuar
          </Link>
        ) : (
          <span className={`${buttonVariants()} pointer-events-none opacity-50`}>
            Selecciona un servicio
          </span>
        )}
      </div>
    </div>
  );
}
