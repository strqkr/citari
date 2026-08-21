"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function TrackLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function submitTrackingCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;
    router.push(`/track/${encodeURIComponent(normalizedCode)}`);
  }

  return (
    <div data-ct className="flex min-h-[100dvh] flex-col bg-background font-sans text-foreground antialiased">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Seguimiento de reserva
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
            Consulta tu <em className="italic text-primary">cita</em>.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-muted-foreground">
            Ingresa el codigo que recibiste al confirmar para ver, cancelar o reagendar tu reserva.
          </p>

          <form
            onSubmit={submitTrackingCode}
            className="mt-8 rounded-xl border border-border bg-card p-6 text-left"
          >
            <div className="space-y-2">
              <Label htmlFor="code">Codigo de seguimiento</Label>
              <Input
                id="code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="CITARI-XXXXXX"
                autoFocus
                className="text-center font-mono tracking-widest"
              />
            </div>
            <Button type="submit" className="mt-4 w-full">
              Consultar reserva
            </Button>
          </form>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
