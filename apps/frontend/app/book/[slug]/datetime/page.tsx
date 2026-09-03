import { Suspense } from "react";
import { DatetimeSelection } from "@/components/booking/DatetimeSelection";
import { BookingShell } from "@/components/layout/BookingShell";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { AvailabilityResponse } from "@/types/availability";

async function loadAvailability(slug: string, serviceId: string, locationId: string): Promise<AvailabilityResponse> {
  if (!serviceId || !locationId) return { timezone: "UTC", slots: [] };
  try {
    const from = new Date(), to = new Date(from.getTime() + 14 * 86400000);
    const query = new URLSearchParams({ serviceId, locationId, from: from.toISOString(), to: to.toISOString() });
    return await apiGet<AvailabilityResponse>(`${endpoints.public.availability(slug)}?${query}`);
  } catch {
    return { timezone: "UTC", slots: [] };
  }
}

export default async function DatetimeSelectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string; location?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const availability = await loadAvailability(slug, query.service ?? "", query.location ?? "");
  return (
    <BookingShell currentStep={2}>
      <Suspense fallback={<p className="text-muted-foreground">Cargando horarios...</p>}>
        <DatetimeSelection slug={slug} slots={availability.slots} timezone={availability.timezone} />
      </Suspense>
    </BookingShell>
  );
}
