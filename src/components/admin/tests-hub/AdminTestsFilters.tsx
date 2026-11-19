"use client";

import type { AdminTestsController } from "./useAdminTests";

/** Каскадные фильтры списка тестов: поиск, предмет → модуль → тема. */
export function AdminTestsFilters({ page }: { page: AdminTestsController }) {
  const { subjects, modules, visibleTopics, subject, setSubject, module, setModule, topic, setTopic, q, setQ } = page;
  return (
    <div className="card grid gap-3 md:grid-cols-4">
      <label className="text-sm">
        Поиск
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input mt-1 w-full" placeholder="Название" />
      </label>
      <label className="text-sm">
        Предмет
        <select
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setModule(""); setTopic(""); }}
          className="input mt-1 w-full"
        >
          <option value="">Все</option>
          {subjects.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
        </select>
      </label>
      <label className="text-sm">
        Модуль
        <select
          value={module}
          onChange={(e) => { setModule(e.target.value); setTopic(""); }}
          className="input mt-1 w-full"
        >
          <option value="">Все модули</option>
          {modules.filter((m) => !subject || String(m.subject_id) === subject).map((m) => (
            <option key={String(m.id)} value={String(m.id)}>{String(m.title ?? m.name)}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Тема
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="input mt-1 w-full">
          <option value="">Все темы</option>
          {visibleTopics.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.title)}</option>)}
        </select>
      </label>
    </div>
  );
}
