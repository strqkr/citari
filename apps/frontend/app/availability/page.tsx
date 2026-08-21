import { AvailabilityManager } from "@/components/admin/AvailabilityManager";
import { PrivateShell } from "@/components/layout/PrivateShell";

export default function AvailabilityPage() {
  return (
    <PrivateShell>
      <AvailabilityManager />
    </PrivateShell>
  );
}
