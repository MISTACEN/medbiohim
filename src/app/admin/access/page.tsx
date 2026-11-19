"use client";

/**
 * Управление доступом к разделам (Access Control, концепция §5).
 * Композиция — в AccessPanel.
 */
import { AccessPanel } from "@/components/admin/panels/AccessPanel";

export default function AdminAccessPage() {
  return <AccessPanel />;
}
