import { notFound } from "next/navigation";
import Link from "next/link";
import { BookingShell } from "@/components/layout/BookingShell";
import { buttonVariants } from "@/components/ui/button";
import { apiGet, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { mockTenant } from "@/lib/mock-data";
import type { Tenant } from "@/types/tenant";

async function loadTenant(slug: string): Promise<Tenant | null> {
  if (isMockMode()) {
    return mockTenant;
  }
  try {
    return await apiGet<Tenant>(endpoints.public.tenant(slug));
  } catch {
    return null;
  }
}

export default async function PublicTenantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await loadTenant(slug);
  if (!tenant) {
    notFound();
  }

  return (
    <BookingShell currentStep={0}>
      <div className="rounded-3xl border border-border bg-card p-8 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Reservar</p>
        <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight">{tenant.name}</h1>
        {tenant.description ? (
          <p className="mt-3 text-muted-foreground">{tenant.description}</p>
        ) : null}
        {tenant.publicMessage ? (
          <div className="mt-5 rounded-2xl bg-primary/5 px-4 py-3 text-sm text-foreground/80">
            {tenant.publicMessage}
          </div>
        ) : null}
        <Link href={`/book/${slug}/service`} className={`${buttonVariants({ size: "lg" })} mt-7 w-full`}>
          Empezar reserva
        </Link>
      </div>
    </BookingShell>
  );
}
