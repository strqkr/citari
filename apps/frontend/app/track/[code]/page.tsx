import { notFound } from "next/navigation";
import Link from "next/link";
import { BookingShell } from "@/components/layout/BookingShell";
import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
type TrackedBooking = { id: string; status: string; startAt: string; endAt: string; serviceName: string; location: { name: string }; tenant: { name: string } };

async function loadBooking(code: string): Promise<TrackedBooking | null> {
  try {
    return await apiGet<TrackedBooking>(endpoints.track.get(code));
  } catch {
    return null;
  }
}

export default async function TrackPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const booking = await loadBooking(code);
  if (!booking) {
    notFound();
  }

  const rows: [string, string][] = [
    ["Reserva", booking.id],
    ["Negocio", booking.tenant.name],
    ["Servicio", booking.serviceName],
    ["Fecha", new Date(booking.startAt).toLocaleString("es-CR")],
    ["Sede", booking.location.name],
    ["Estado", booking.status]
  ];

  return (
    <BookingShell>
      <div className="rounded-3xl border border-border bg-card p-8 shadow-soft">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Reserva encontrada
        </span>
        <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight">Detalle de tu cita</h1>

        <dl className="mt-6 divide-y divide-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-3"><Link href="/track" className={buttonVariants({ variant: "outline" })}>Consultar otra reserva</Link>{booking.status === "PENDING" || booking.status === "CONFIRMED" ? <><Link href={`/track/${encodeURIComponent(code)}/reschedule`} className={buttonVariants({ variant: "outline" })}>Reagendar</Link><Link href={`/track/${encodeURIComponent(code)}/cancel`} className={buttonVariants({ variant: "destructive" })}>Cancelar</Link></> : null}</div>
      </div>
    </BookingShell>
  );
}
