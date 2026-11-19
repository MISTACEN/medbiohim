import {
  BookOpen,
  ClipboardList,
  FileUp,
  FlaskConical,
  UsersRound,
} from "lucide-react";

export type Draft = { grade: string; comment: string };
export type Tab = "roster" | "queue" | "tests" | "create" | "publications";

export const TABS: Array<{ id: Tab; label: string; icon: typeof UsersRound }> = [
  { id: "roster", label: "Группы и студенты", icon: UsersRound },
  { id: "queue", label: "Работы на проверку", icon: ClipboardList },
  { id: "tests", label: "Тесты и назначения", icon: FlaskConical },
  { id: "create", label: "Создать тест", icon: FileUp },
  { id: "publications", label: "Публикации и редактор", icon: BookOpen },
];

export function chipStyle(kind: "ok" | "warn" | "info" | "neutral") {
  if (kind === "ok")
    return { background: "var(--status-ok-bg)", color: "var(--status-ok-fg)", borderColor: "var(--status-ok-border)" };
  if (kind === "warn")
    return { background: "var(--status-warn-bg)", color: "var(--status-warn-fg)", borderColor: "var(--status-warn-border)" };
  if (kind === "info")
    return { background: "var(--status-info-bg)", color: "var(--status-info-fg)", borderColor: "var(--status-info-border)" };
  return { background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)", borderColor: "var(--status-neutral-border)" };
}
