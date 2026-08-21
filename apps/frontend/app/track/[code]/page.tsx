import { notFound } from "next/navigation";
import Link from "next/link";
import { BookingShell } from "@/components/layout/BookingShell";
import { buttonVariants } from "@/components/ui/button";
import { apiGet, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { mockBookings } from "@/lib/mock-data";
import type { Booking } from "@/types/booking";

async function loadBooking(code: string): Promise<Booking | null> {
  if (isMockMode()) {
    return mockBookings.find((item) => item.trackingCode === code) || mockBookings[0];
  }
  try {
    return await apiGet<Booking>(endpoints.track.get(code));
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
    ["Codigo", booking.trackingCode],
    ["Cliente", booking.customerName],
    ["Servicio", booking.serviceName],
    ["Fecha", `${booking.bookingDate} - ${booking.startTime}`],
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

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/track/${booking.trackingCode}/reschedule`} className={buttonVariants()}>
            Reagendar
          </Link>
          <Link
            href={`/track/${booking.trackingCode}/cancel`}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancelar
          </Link>
        </div>
      </div>
    </BookingShell>
  );
}
