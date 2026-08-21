import { BookingsManager } from "@/components/admin/BookingsManager";
import { PrivateShell } from "@/components/layout/PrivateShell";

export default function BookingsPage() {
  return (
    <PrivateShell>
      <BookingsManager />
    </PrivateShell>
  );
}
