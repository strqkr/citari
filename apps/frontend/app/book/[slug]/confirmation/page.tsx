"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BookingShell } from "@/components/layout/BookingShell";
import { buttonVariants } from "@/components/ui/button";

function Confirmation() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params?.slug ?? "";
  const name = searchParams.get("name");
  const code = searchParams.get("code");

  return (
    <div className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Reserva registrada
      </span>

      <h1 className="mt-5 font-serif text-4xl font-medium tracking-tight">
        {name ? `Listo, ${name}.` : "Tu cita quedo registrada."}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        Guarda este codigo para consultar, cancelar o reagendar tu reserva cuando lo necesites.
      </p>

      <div className="mx-auto mt-7 max-w-xs rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-6 py-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Codigo de seguimiento</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-foreground">
          {code ?? "CITARI-------"}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href={code ? `/track/${code}` : "/track"} className={buttonVariants()}>
          Consultar reserva
        </Link>
        {slug ? (
          <Link href={`/book/${slug}`} className={buttonVariants({ variant: "outline" })}>
            Volver al negocio
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function BookingConfirmationPage() {
  return (
    <BookingShell currentStep={4}>
      <Suspense fallback={<p className="text-muted-foreground">Cargando...</p>}>
        <Confirmation />
      </Suspense>
    </BookingShell>
  );
}
