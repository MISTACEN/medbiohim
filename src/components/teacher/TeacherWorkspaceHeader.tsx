"use client";

import { BookOpen, FileUp, UsersRound } from "lucide-react";

import { chipStyle } from "./model";
import type { TeacherWorkspaceView } from "./useTeacherWorkspace";

/** Шапка области: статус модуля, кто преподаватель и что именно ему разрешено. */
export function TeacherWorkspaceHeader({ tw }: { tw: TeacherWorkspaceView }) {
  const { user, scope, overview, groupNames, setTab } = tw;
  return (
    <header className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={chipStyle("ok")}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-ok-fg)" }} />
          Кабинет преподавателя · подключён к ядру MEDBIOHIM
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          style={chipStyle(scope && !scope.active ? "warn" : "info")}
        >
          {scope && !scope.active
            ? "Область не назначена — видны только свои задания"
            : "Полномочия выданы администратором"}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Кабинет преподавателя</h1>
          <p className="page-subtitle">
            {user?.name ? <strong>{user.name}</strong> : "Преподаватель"} · только назначенные группы
            {groupNames.length ? ` (${groupNames.join(", ")})` : ""}. Режим аудита и рецензирования.
          </p>
          {overview?.subjects?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {overview.subjects.map((subject) => (
                <span
                  key={subject.id}
                  className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                  style={chipStyle("neutral")}
                >
                  {subject.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => setTab("roster")}>
            <UsersRound className="h-4 w-4" /> Ведомость успеваемости
          </button>
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => setTab("publications")}>
            <BookOpen className="h-4 w-4" /> Опубликовать материал
          </button>
          <button type="button" className="btn-primary inline-flex items-center gap-1.5 text-sm" onClick={() => setTab("create")}>
            <FileUp className="h-4 w-4" /> Создать тест
          </button>
        </div>
      </div>
    </header>
  );
}
