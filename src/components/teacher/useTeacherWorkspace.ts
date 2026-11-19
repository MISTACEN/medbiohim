"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { canUseTeacherWorkspace } from "@/shared/permissions";
import { hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  gradeSubmission,
  returnSubmission,
  teacherOverview,
  teacherStudents,
  teacherSubmissions,
  teacherTestAssignments,
  type TeacherOverview,
  type TeacherStudent,
  type TeacherSubmission,
  type TeacherTestAssignment,
} from "@/lib/api/teacher";

import { type Draft, type Tab } from "./model";

/**
 * Данные и действия кабинета преподавателя: загрузка overview/очереди/состава/
 * назначений, черновики оценок, отправка оценки и возврата, KPI и метрики.
 * Разметка — в шапке, KPI-плитках, вкладках и панели проверки работ.
 */
export function useTeacherWorkspace() {
  const { user, loading: authLoading } = useAuth();
  const roles = user?.roles?.length ? user.roles : [user?.role];
  const allowed = canUseTeacherWorkspace(roles);

  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [items, setItems] = useState<TeacherSubmission[]>([]);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [assignments, setAssignments] = useState<TeacherTestAssignment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<Tab>("roster");

  const load = useCallback(async () => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [summary, pending, roster, assignmentsResult] = await Promise.all([
      teacherOverview(),
      teacherSubmissions("status=submitted"),
      teacherStudents(),
      teacherTestAssignments(),
    ]);
    if (summary.ok) setOverview(summary.data);
    else setError(describeApiError(summary.error));
    if (pending.ok) setItems(pending.data.items);
    if (roster.ok) setStudents(roster.data.items);
    if (assignmentsResult.ok) setAssignments(assignmentsResult.data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && allowed) void load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, allowed, load]);

  function draftFor(id: string): Draft {
    return drafts[id] || { grade: "", comment: "" };
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), ...patch } }));
  }

  async function submit(id: string, mode: "grade" | "return") {
    const draft = draftFor(id);
    const grade = Number(draft.grade);
    if (mode === "grade" && (!Number.isFinite(grade) || grade < 0 || grade > 100)) {
      setNote("Оценка — число от 0 до 100");
      return;
    }
    if (mode === "return" && !draft.comment.trim()) {
      setNote("Опишите, что нужно исправить");
      return;
    }
    setBusy(id);
    setNote("");
    const result =
      mode === "grade"
        ? await gradeSubmission(id, grade, draft.comment)
        : await returnSubmission(id, draft.comment);
    setBusy("");
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setItems((rows) => rows.filter((row) => row.id !== id));
    setNote(mode === "grade" ? "Оценка сохранена" : "Работа возвращена на доработку");
    void load();
  }

  const kpi = useMemo(() => {
    const scored = students.filter((student) => student.avg_percent != null);
    const average =
      scored.length > 0
        ? Math.round((scored.reduce((sum, student) => sum + (student.avg_percent || 0), 0) / scored.length) * 10) / 10
        : null;
    const targeted = assignments.reduce((sum, item) => sum + (item.students_targeted || 0), 0);
    const completed = assignments.reduce((sum, item) => sum + (item.completed || 0), 0);
    const coverage = targeted > 0 ? Math.round((completed / targeted) * 100) : null;
    return { average, scored: scored.length, targeted, completed, coverage };
  }, [students, assignments]);

  const counts = overview?.counts;
  const scope = overview?.scope;
  const groupNames = (overview?.groups || [])
    .map((group) => group.name || group.code || "Группа")
    .slice(0, 4);

  const metrics = [
    {
      id: "groups",
      label: "Назначенные группы",
      value: String(counts?.groups ?? scope?.groups ?? 0),
      hint: `${counts?.students ?? scope?.students ?? 0} студ.`,
      footer: groupNames.length ? groupNames.join(" · ") : "Назначение выдаёт администратор",
      chip: "адм.",
      chipKind: "neutral" as const,
      icon: UsersRound,
      tone: "var(--primary)",
      toneBg: "var(--status-info-bg)",
    },
    {
      id: "tests",
      label: "Активные тестирования",
      value: String(assignments.length),
      hint: "назначено",
      footer:
        kpi.coverage == null
          ? "Назначений пока нет"
          : `Сдали ${kpi.completed} из ${kpi.targeted} · ${kpi.coverage}% охват`,
      chip: kpi.coverage == null ? "" : `${kpi.coverage}%`,
      chipKind: "info" as const,
      icon: FlaskConical,
      tone: "var(--primary)",
      toneBg: "var(--status-info-bg)",
    },
    {
      id: "average",
      label: "Средний балл по тестам",
      value: kpi.average == null ? "—" : `${kpi.average}%`,
      hint: kpi.average == null ? "" : "по вашим тестам",
      footer:
        kpi.average == null
          ? "Пока нет завершённых попыток"
          : `${kpi.scored} студ. с результатами`,
      chip: kpi.average != null && kpi.average >= 80 ? "выше порога" : "",
      chipKind: "ok" as const,
      icon: CheckCircle2,
      tone: "var(--status-ok-fg)",
      toneBg: "var(--status-ok-bg)",
    },
    {
      id: "pending",
      label: "Ожидают проверки",
      value: String(counts?.pending ?? items.length),
      hint: "работ",
      footer: `Проверено ${counts?.graded ?? 0} · возвращено ${counts?.returned ?? 0}`,
      chip: (counts?.pending ?? items.length) > 0 ? "требует внимания" : "очередь пуста",
      chipKind: (counts?.pending ?? items.length) > 0 ? ("warn" as const) : ("ok" as const),
      icon: ClipboardList,
      tone: "var(--status-critical-fg)",
      toneBg: "var(--status-critical-bg)",
    },
  ];

  const tabCounts: Record<Tab, string> = {
    roster: counts?.students ? String(counts.students) : "",
    queue: String(counts?.pending ?? items.length),
    tests: String(assignments.length),
    create: "",
    publications: "",
  };

  return {
    user, authLoading, allowed,
    overview, items, students, assignments,
    loading, error, note, busy, tab, setTab,
    load, draftFor, patchDraft, submit, kpi,
    counts, scope, groupNames, metrics, tabCounts,
  };
}

export type TeacherWorkspaceView = ReturnType<typeof useTeacherWorkspace>;
