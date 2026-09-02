"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BookingShell } from "@/components/layout/BookingShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, apiPostIdempotent } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type ConfirmationResult = {
  trackingToken: string;
  booking: {
    id: string;
    status: string;
    startAt: string;
    endAt: string;
    serviceName: string;
    servicePrice: string | number | null;
    currency: string;
    customer: { firstName: string };
    location: { name: string };
    tenant: { name: string; timezone: string; locale: string };
  };
};

export default function BookingConfirmationPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? "";
  const [result, setResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [retryPayload, setRetryPayload] = useState<{ nonce: string; key: string } | null>(null);

  const requestConfirmation = useCallback(async (nonce: string, key: string) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiPostIdempotent<ConfirmationResult>(endpoints.public.bookingConfirmation(slug), { confirmationNonce: nonce }, key));
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 410 ? "La confirmación venció o ya fue mostrada." : "No pudimos recuperar la confirmación de la reserva.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const nonce = new URLSearchParams(window.location.hash.slice(1)).get("nonce");
    history.replaceState(null, "", window.location.pathname);
    if (!nonce || !slug) {
      setError("La confirmación no está disponible. Revisa tu acceso de seguimiento.");
      setLoading(false);
      return;
    }
    const payload = { nonce, key: crypto.randomUUID() };
    setRetryPayload(payload);
    void requestConfirmation(payload.nonce, payload.key);
  }, [requestConfirmation, slug]);

  async function copyAccess() {
    if (!result) return;
    await navigator.clipboard.writeText(result.trackingToken);
    setCopied(true);
  }

  function openTracking() {
    if (!result) return;
    router.push(`/track#${new URLSearchParams({ token: result.trackingToken }).toString()}`);
  }

  return <BookingShell currentStep={4}>
    {loading ? <p role="status" className="text-center text-muted-foreground">Confirmando tu reserva...</p> : null}
    {error ? <div className="text-center"><p role="alert" className="text-destructive">{error}</p><div className="mt-5 flex justify-center gap-3">{retryPayload ? <Button type="button" onClick={() => void requestConfirmation(retryPayload.nonce, retryPayload.key)}>Reintentar</Button> : null}<Link href="/track" className={buttonVariants({ variant: "outline" })}>Consultar una reserva</Link></div></div> : null}
    {result ? <div className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Reserva registrada</span>
      <h1 className="mt-5 font-serif text-4xl font-medium tracking-tight">Listo, {result.booking.customer.firstName}.</h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">Tu cita en {result.booking.tenant.name} quedó registrada. Guarda el acceso privado para consultarla, cancelarla o reagendarla.</p>
      <dl className="mx-auto mt-7 max-w-md divide-y rounded-2xl border bg-card px-5 text-sm">
        <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Servicio</dt><dd className="font-medium">{result.booking.serviceName}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Fecha</dt><dd className="font-medium">{new Date(result.booking.startAt).toLocaleString("es-CR", { timeZone: result.booking.tenant.timezone })}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Sede</dt><dd className="font-medium">{result.booking.location.name}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Estado</dt><dd className="font-medium">{result.booking.status}</dd></div>
      </dl>
      <div className="mx-auto mt-5 max-w-md rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-6 py-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Acceso privado de seguimiento</p>
        <p className="mt-1 font-mono text-sm font-semibold">••••{result.trackingToken.slice(-10)}</p>
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={copyAccess}>{copied ? "Copiado" : "Copiar acceso"}</Button>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3"><Button type="button" onClick={openTracking}>Consultar reserva</Button><Link href={`/book/${slug}`} className={buttonVariants({ variant: "outline" })}>Volver al negocio</Link></div>
    </div> : null}
  </BookingShell>;
}
