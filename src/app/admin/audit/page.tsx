"use client";

/** Аудит изменений контента: журнал версий, diff и откат. Композиция — в AuditPanel. */
import { AuditPanel } from "@/components/admin/panels/AuditPanel";

export default function AdminAuditPage() {
  return <AuditPanel />;
}
