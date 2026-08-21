"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BookingShell } from "@/components/layout/BookingShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export default function TrackCancelPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? "";
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setError(null);
    if (isMockMode()) {
      setDone(true);
      return;
    }
    setLoading(true);
    try {
      await apiPost(endpoints.track.cancel(code));
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo cancelar la reserva.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <BookingShell>
      <div className="rounded-3xl border border-border bg-card p-8 shadow-soft">
        {done ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-muted-foreground">
              Reserva cancelada
            </span>
            <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight">Cita cancelada</h1>
            <p className="mt-2 text-muted-foreground">
              Tu reserva <span className="font-mono">{code}</span> fue cancelada.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/track" className={buttonVariants()}>
                Consultar otra reserva
              </Link>
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Volver al inicio
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Cancelar tu cita</h1>
            <p className="mt-2 text-muted-foreground">
              Esta accion no se puede deshacer. Codigo <span className="font-mono">{code}</span>.
            </p>
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={cancel}
                disabled={loading}
                className="bg-destructive text-destructive-foreground hover:brightness-110"
              >
                {loading ? "Cancelando..." : "Confirmar cancelacion"}
              </Button>
              <Link href={`/track/${code}`} className={buttonVariants({ variant: "outline" })}>
                Volver
              </Link>
            </div>
          </>
        )}
      </div>
    </BookingShell>
  );
}
