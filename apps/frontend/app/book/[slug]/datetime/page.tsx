import { Suspense } from "react";
import { DatetimeSelection } from "@/components/booking/DatetimeSelection";
import { BookingShell } from "@/components/layout/BookingShell";
import { apiGet, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { mockAvailability } from "@/lib/mock-data";
import type { AvailabilityBlock } from "@/types/availability";

async function loadAvailability(slug: string): Promise<AvailabilityBlock[]> {
  if (isMockMode()) {
    return mockAvailability;
  }
  try {
    return await apiGet<AvailabilityBlock[]>(endpoints.public.availability(slug));
  } catch {
    return [];
  }
}

export default async function DatetimeSelectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blocks = await loadAvailability(slug);
  return (
    <BookingShell currentStep={2}>
      <Suspense fallback={<p className="text-muted-foreground">Cargando horarios...</p>}>
        <DatetimeSelection slug={slug} blocks={blocks} />
      </Suspense>
    </BookingShell>
  );
}
