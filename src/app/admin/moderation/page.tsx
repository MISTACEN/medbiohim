"use client";

/**
 * Центр быстрого реагирования: запросы старост, быстрые фиксы с предпросмотром
 * и откатом 24 часа, слияние дубликатов тем и уведомления.
 * Композиция — в ModerationPanel.
 */
import { ModerationPanel } from "@/components/admin/panels/ModerationPanel";

export default function AdminModerationPage() {
  return <ModerationPanel />;
}
