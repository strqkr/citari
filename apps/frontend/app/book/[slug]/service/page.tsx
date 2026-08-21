import { ServiceSelection } from "@/components/booking/ServiceSelection";
import { BookingShell } from "@/components/layout/BookingShell";
import { apiGet, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { mockServices } from "@/lib/mock-data";
import type { Service } from "@/types/service";

async function loadServices(slug: string): Promise<Service[]> {
  if (isMockMode()) {
    return mockServices;
  }
  try {
    return await apiGet<Service[]>(endpoints.public.services(slug));
  } catch {
    return [];
  }
}

export default async function ServiceSelectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const services = await loadServices(slug);
  return (
    <BookingShell currentStep={1}>
      <ServiceSelection slug={slug} services={services} />
    </BookingShell>
  );
}
