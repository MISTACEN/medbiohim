"use client";

/**
 * Кабинет преподавателя (этап H плана).
 *
 * Один экран-дашборд: шапка области, четыре KPI по реальным данным API и вкладки
 * — состав групп, работы на проверку, тесты с назначениями, публикации в научном
 * редакторе. Показывает только свою область: назначенные группы, студентов,
 * авторские задания и работы по ним. Оценка и возврат на доработку идут через
 * те же серверные маршруты, что и раньше, — сервер заново проверяет область.
 * Пустой кабинет без назначений — нормальное состояние, а не ошибка.
 *
 * Состояние и запросы — в useTeacherWorkspace, разметка — в шапке, KPI,
 * вкладках и панели проверки работ.
 */
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { hasToken } from "@/lib/api";
import { ImportTest } from "@/components/teacher/ImportTest";
import { MyLectures } from "@/components/teacher/MyLectures";
import { MyQuestionBank } from "@/components/teacher/MyQuestionBank";
import { MyTests } from "@/components/teacher/MyTests";
import { MyStudents } from "@/components/teacher/MyStudents";
import { TestAssignments } from "@/components/teacher/TestAssignments";
import { useTeacherWorkspace } from "@/components/teacher/useTeacherWorkspace";
import { TeacherWorkspaceHeader } from "@/components/teacher/TeacherWorkspaceHeader";
import { TeacherKpis, TeacherTabs } from "@/components/teacher/TeacherWorkspaceTabs";
import { TeacherQueue } from "@/components/teacher/TeacherQueue";

export default function TeacherPage() {
  const tw = useTeacherWorkspace();

  if (tw.authLoading || (tw.loading && tw.allowed && hasToken())) {
    return (
      <div className="flex items-center gap-2 text-sm" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загружаем кабинет преподавателя…
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Кабинет преподавателя</h1>
        <p className="page-subtitle">Сначала войдите в аккаунт.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );
  }

  if (!tw.allowed) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="page-title">Только для преподавателей</h1>
        <p className="page-subtitle">
          Раздел доступен роли «преподаватель» и администратору. Роль выдаёт
          администратор в разделе «Пользователи и роли».
        </p>
        <Link href="/" className="btn-secondary mt-4 inline-flex">
          На главную
        </Link>
      </div>
    );
  }

  const scope = tw.scope;

  return (
    <div className="space-y-5">
      <TeacherWorkspaceHeader tw={tw} />

      {tw.error ? (
        <div
          className="card p-4 text-sm"
          role="alert"
          style={{ borderLeft: "4px solid var(--status-critical-fg)", color: "var(--status-critical-fg)" }}
        >
          {tw.error}
        </div>
      ) : null}
      {tw.note ? (
        <div className="card p-3 text-sm" role="status">{tw.note}</div>
      ) : null}

      {scope && !scope.active ? (
        <div className="card p-4 text-sm">
          <strong>Область пока не назначена.</strong>{" "}
          {scope.available
            ? "Авторские задания доступны, но чужие группы и студенты — нет. Попросите администратора назначить группы в разделе «Преподаватели»."
            : "Таблица назначений ещё не применена на этом окружении: кабинет работает только с вашими заданиями."}
        </div>
      ) : null}

      <TeacherKpis tw={tw} />

      <TeacherTabs tw={tw} />

      {tw.tab === "roster" ? <MyStudents /> : null}

      {tw.tab === "queue" ? <TeacherQueue tw={tw} /> : null}

      {tw.tab === "create" ? (
        <div className="space-y-6" role="tabpanel">
          <ImportTest onCreated={() => void tw.load()} />
        </div>
      ) : null}

      {tw.tab === "tests" ? (
        <div className="space-y-6" role="tabpanel">
          <MyTests />
          <TestAssignments />
        </div>
      ) : null}

      {tw.tab === "publications" ? (
        <div className="space-y-6" role="tabpanel">
          <MyLectures />
          <MyQuestionBank />
        </div>
      ) : null}
    </div>
  );
}
