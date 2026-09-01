import { ServiceSelection } from "@/components/booking/ServiceSelection";
import { BookingShell } from "@/components/layout/BookingShell";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { Service, ServiceCategory } from "@/types/service";

async function loadServices(slug: string): Promise<Service[]> {
  try {
    const categories = await apiGet<(ServiceCategory & { services: Service[] })[]>(endpoints.public.services(slug));
    return categories.flatMap((category) => category.services.map((service) => ({ ...service, categoryId: category.id, category })));
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
