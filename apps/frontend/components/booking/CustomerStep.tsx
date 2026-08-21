"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

const textareaClass =
  "flex min-h-[88px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

type BookingResponse = { trackingCode: string };

export function CustomerStep({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serviceId = searchParams.get("service") || "";
  const blockId = searchParams.get("block") || "";
  const locationId = searchParams.get("location") || "";
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isMockMode()) {
      const params = new URLSearchParams({ name: form.firstName, code: "CITARI-DEMO01" });
      router.push(`/book/${slug}/confirmation?${params.toString()}`);
      return;
    }

    if (!serviceId || !blockId || !locationId) {
      setError("Falta informacion del horario seleccionado. Volve a elegir fecha y hora.");
      return;
    }

    setLoading(true);
    try {
      const booking = await apiPost<BookingResponse>(endpoints.public.bookings(slug), {
        serviceId: Number(serviceId),
        locationId: Number(locationId),
        availabilityBlockId: Number(blockId),
        customer: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone
        },
        customerNotes: form.notes || null
      });

      const params = new URLSearchParams({ name: form.firstName, code: booking.trackingCode });
      router.push(`/book/${slug}/confirmation?${params.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.title : "No se pudo crear la reserva. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium tracking-tight">Completa tus datos</h1>
      <p className="mt-2 text-muted-foreground">
        Usaremos esta informacion solo para gestionar tu reserva.
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm text-foreground/80">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        <span>Recibiras un codigo para consultar, cancelar o reagendar tu reserva sin crear cuenta.</span>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nombre</Label>
            <Input id="firstName" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder="Sofia" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Apellido</Label>
            <Input id="lastName" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} placeholder="Campos" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Correo electronico</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="sofia@email.com" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefono</Label>
          <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="8888-8888" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notas opcionales</Label>
          <textarea
            id="notes"
            className={textareaClass}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Algo que el negocio deba saber"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href={`/book/${slug}/datetime?service=${serviceId}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Volver
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? "Reservando..." : "Confirmar reserva"}
          </Button>
        </div>
      </form>
    </div>
  );
}
