import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { PrivateShell } from "@/components/layout/PrivateShell";

export default function ServiceCategoriesPage() {
  return (
    <PrivateShell>
      <CategoriesManager />
    </PrivateShell>
  );
}
