import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";

/** Общий каркас всех страниц /admin: одна навигация вместо локальных меню. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1700px]">
      <div className="grid gap-4 lg:grid-cols-[236px_minmax(0,1fr)]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
