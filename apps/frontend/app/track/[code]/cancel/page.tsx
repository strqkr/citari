import { notFound } from "next/navigation";
import { BookingShell } from "@/components/layout/BookingShell";
import { TrackingActionForm } from "@/components/booking/TrackingActionForm";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export default async function CancelBooking({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const booking = await apiGet<{ version: number }>(endpoints.track.get(code)).catch(() => null);
  if (!booking) notFound();
  return <BookingShell><div className="mx-auto max-w-lg rounded-3xl border bg-card p-8"><h1 className="font-serif text-3xl">Cancelar reserva</h1><p className="my-4 text-muted-foreground">Esta acción libera el horario y queda registrada.</p><TrackingActionForm code={code} version={booking.version} action="cancel" /></div></BookingShell>;
}
