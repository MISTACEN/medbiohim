"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui";
import type { AdminTestsController } from "./useAdminTests";

/** Таблица тестов с публикацией и действиями (редактирование, архивирование). */
export function AdminTestsTable({ page }: { page: AdminTestsController }) {
  const { loading, filtered, subjects, topics, setEditing, remove } = page;

  if (loading) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Загружаю тесты и банк вопросов…
      </div>
    );
  }

  return (
    <div className="card overflow-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="border-b text-left"><th className="p-3">Тест</th><th className="p-3">Предмет</th><th className="p-3">Тема</th><th className="p-3">Публикация</th><th className="p-3">Действия</th></tr></thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={String(t.id)} className="border-b">
              <td className="p-3 font-medium">{String(t.title)}</td>
              <td className="p-3">{String(subjects.find((s) => String(s.id) === String(t.subject_id))?.name ?? "—")}</td>
              <td className="p-3">{String(topics.find((x) => String(x.id) === String(t.topic_id))?.name ?? topics.find((x) => String(x.id) === String(t.topic_id))?.title ?? "—")}</td>
              <td className="p-3">{t.is_published ? <Badge tone="success">Опубликован</Badge> : <Badge tone="neutral">Черновик</Badge>}</td>
              <td className="p-3">
                <button className="mr-2 rounded-lg bg-indigo-50 p-2 text-indigo-700" onClick={() => setEditing({ ...t })} title="Редактировать"><Pencil className="h-4 w-4" /></button>
                <button className="rounded-lg bg-[var(--status-critical-bg)] p-2 text-[var(--status-critical-fg)]" onClick={() => void remove(t)} title="Архивировать"><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!filtered.length && <div className="p-8 text-center text-sm text-slate-500">Тестов не найдено.</div>}
    </div>
  );
}
