import { ServicesManager } from "@/components/admin/ServicesManager";
import { PrivateShell } from "@/components/layout/PrivateShell";

export default function ServicesPage() {
  return (
    <PrivateShell>
      <ServicesManager />
    </PrivateShell>
  );
}
