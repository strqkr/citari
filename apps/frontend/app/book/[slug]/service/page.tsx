import { ServiceSelection } from "@/components/booking/ServiceSelection";
import { BookingShell } from "@/components/layout/BookingShell";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { Service, ServiceCategory } from "@/types/service";

type PublicLocation = { id: string; name: string; addressLine1: string | null; province: string | null; canton: string | null; isMain: boolean };

async function loadServices(slug: string): Promise<Service[]> {
  try {
    const categories = await apiGet<(ServiceCategory & { services: Service[] })[]>(endpoints.public.services(slug));
    return categories.flatMap((category) => category.services.map((service) => ({ ...service, categoryId: category.id, category })));
  } catch {
    return [];
  }
}

async function loadLocations(slug: string): Promise<PublicLocation[]> {
  try {
    return await apiGet<PublicLocation[]>(endpoints.public.locations(slug));
  } catch {
    return [];
  }
}

export default async function ServiceSelectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [services, locations] = await Promise.all([loadServices(slug), loadLocations(slug)]);
  return (
    <BookingShell currentStep={1}>
      <ServiceSelection slug={slug} services={services} locations={locations} />
    </BookingShell>
  );
}
