import { AdminShell } from "@/components/admin/admin-shell";
import { TenantsManager } from "@/components/admin/TenantsManager";

export default function AdminTenantsPage() {
  return (
    <AdminShell>
      <TenantsManager />
    </AdminShell>
  );
}
