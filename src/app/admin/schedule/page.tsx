"use client";

/**
 * CMS · Сетка расписания (drag-and-drop).
 * Источник истины = PostgreSQL/Supabase (policy=db_primary_no_merge).
 * Local JSON — только аварийный fallback.
 */
import { ScheduleHubPanel } from "@/components/admin/schedule-hub/ScheduleHubPanel";

export default function AdminSchedulePage() {
  return <ScheduleHubPanel />;
}
