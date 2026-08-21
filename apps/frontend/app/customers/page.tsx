import { CustomersManager } from "@/components/admin/CustomersManager";
import { PrivateShell } from "@/components/layout/PrivateShell";

export default function CustomersPage() {
  return (
    <PrivateShell>
      <CustomersManager />
    </PrivateShell>
  );
}
