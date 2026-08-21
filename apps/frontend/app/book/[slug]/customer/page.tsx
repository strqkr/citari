import { Suspense } from "react";
import { CustomerStep } from "@/components/booking/CustomerStep";
import { BookingShell } from "@/components/layout/BookingShell";

export default async function CustomerDataPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <BookingShell currentStep={3}>
      <Suspense fallback={<p className="text-muted-foreground">Cargando formulario...</p>}>
        <CustomerStep slug={slug} />
      </Suspense>
    </BookingShell>
  );
}
