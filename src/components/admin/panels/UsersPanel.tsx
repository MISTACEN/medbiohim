"use client";

/** Пользователи и роли: композиция — поиск, фильтры, карточки, пагинация. */
import Link from "next/link";
import { hasToken } from "@/lib/api";
import { UsersUserCard } from "@/components/admin/panels/UsersUserCard";
import { useUsersPanel } from "@/components/admin/panels/useUsersPanel";
import { USERS_PAGE_SIZE, USERS_ROLES, USERS_ROLE_LABEL } from "@/components/admin/panels/model";

export function UsersPanel() {
  const panel = useUsersPanel();
  const {
    users, total, offset, groups, drafts, setDrafts,
    saving, query, setQuery, applied, roleFilter, setRoleFilter,
    groupFilter, setGroupFilter, loading, error, ok,
    dialog, load, applyFilters, resetFilters, saveAcademic, toggleRole,
  } = panel;

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Пользователи</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const shown = users.length;
  const hasPrev = offset > 0;
  const hasNext = offset + shown < total;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Пользователи и роли</h1>
        <p className="page-subtitle">
          Поиск по почте и имени, фильтры по роли и группе · всего {total}
        </p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {ok && <div className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]">{ok}</div>}

      <form onSubmit={applyFilters} className="card grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_200px_auto]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Почта или ФИО"
          aria-label="Поиск пользователя"
          className="rounded-xl border px-3 py-2 text-sm"
        />
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); void load(applied, e.target.value, groupFilter, 0); }} aria-label="Фильтр по роли" className="rounded-xl border px-3 py-2 text-sm">
          <option value="">Все роли</option>
          {USERS_ROLES.map((role) => <option key={role} value={role}>{USERS_ROLE_LABEL[role]}</option>)}
        </select>
        <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); void load(applied, roleFilter, e.target.value, 0); }} aria-label="Фильтр по группе" className="rounded-xl border px-3 py-2 text-sm">
          <option value="">Все группы</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.code}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={loading}>{loading ? "Ищем…" : "Найти"}</button>
          <button type="button" className="btn-secondary" onClick={resetFilters} disabled={loading}>Сброс</button>
        </div>
      </form>

      <div className="space-y-3">
        {users.map((u) => {
          const draft = drafts[u.id] || { groupId: String(u.group_id || ""), semester: String(u.semester || 3) };
          return (
            <UsersUserCard
              key={u.id}
              u={u}
              draft={draft}
              groups={groups}
              saving={saving}
              onDraft={(patch) => setDrafts((x) => ({ ...x, [u.id]: { ...draft, ...patch } }))}
              onSaveAcademic={(user) => void saveAcademic(user)}
              onToggleRole={(user, role) => void toggleRole(user, role)}
            />
          );
        })}
        {!loading && users.length === 0 && (
          <div className="card text-sm text-slate-500">
            {applied || roleFilter || groupFilter ? "Никого не нашли — измените фильтры." : "Пользователей пока нет."}
          </div>
        )}
      </div>

      {dialog}

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">
            {offset + 1}–{offset + shown} из {total}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!hasPrev || loading} onClick={() => void load(applied, roleFilter, groupFilter, Math.max(offset - USERS_PAGE_SIZE, 0))}>
              Назад
            </button>
            <button type="button" className="btn-secondary" disabled={!hasNext || loading} onClick={() => void load(applied, roleFilter, groupFilter, offset + USERS_PAGE_SIZE)}>
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
