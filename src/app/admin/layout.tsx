import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminGate } from "@/components/admin/AdminGate";

/**
 * Общий каркас всех страниц /admin: одна навигация вместо локальных меню
 * и один роль-гейт на весь раздел.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <div className="mx-auto w-full max-w-[1700px]">
        <div className="grid gap-4 lg:grid-cols-[236px_minmax(0,1fr)]">
          <AdminNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </AdminGate>
  );
}
