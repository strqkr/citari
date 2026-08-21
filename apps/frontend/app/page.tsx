import type { Metadata } from "next";
import { MarketingLanding } from "@/components/marketing/marketing-landing";

export const metadata: Metadata = {
  title: "Inicio",
  description:
    "Citari es un software de reservas online para negocios de servicios que necesitan agenda, disponibilidad y seguimiento en un solo lugar.",
  alternates: { canonical: "/" }
};

export default function HomePage() {
  return <MarketingLanding />;
}
