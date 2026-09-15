"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminOverview,
  adminUpdateSite,
  adminListAnnouncements,
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  adminGetCurriculum,
  adminSaveCurriculum,
  adminGetTests,
  adminSaveTests,
  adminListUsers,
  adminSetUserRole,
  claimAdmin,
  listGroups,
  listSubjects,
  listSchedule,
  saveSchedule,
  createGroup,
  createSubject,
  hasToken,
} from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";

type Tab =
  | "overview"
  | "site"
  | "announcements"
  | "schedule"
  | "curriculum"
  | "tests"
  | "groups"
  | "subjects"
  | "roles";

type Announcement = { id: string; title: string; body: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "site", label: "Сайт" },
  { id: "announcements", label: "Объявления" },
  { id: "schedule", label: "Расписание" },
  { id: "curriculum", label: "Учебный план" },
  { id: "tests", label: "Тесты" },
  { id: "groups", label: "Группы" },
  { id: "subjects", label: "Предметы" },
  { id: "roles", label: "Роли" },
];

export default function AdminPage() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [site, setSite] = useState({
    title: "Медбиохим",
    subtitle: "образовательная платформа",
    description: "",
    announcement_banner: "",
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [aTitle, setATitle] = useState("");
  const [aBody, setABody] = useState("");
  const [scheduleJson, setScheduleJson] = useState("[]");
  const [curriculumJson, setCurriculumJson] = useState("[]");
  const [testsJson, setTestsJson] = useState("[]");
  const [groups, setGroups] = useState<unknown[]>([]);
  const [subjects, setSubjects] = useState<unknown[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectCourse, setSubjectCourse] = useState("1");
  const [users, setUsers] = useState<
    Array<{ id: string; email?: string; full_name?: string; roles: string[] }>
  >([]);
  const [claimSecret, setClaimSecret] = useState("medbiohim-admin-2026");

  async function loadOverview() {
    setError(null);
    if (!hasToken()) {
      setError("Нужен вход");
      return;
    }
    const res = await adminOverview();
    if (!res.ok) {
      setError(res.error.message + " — откройте вкладку Роли → Стать админом");
      return;
    }
    setCounts(res.data.counts as Record<string, number>);
    const s = res.data.site as typeof site;
    if (s) {
      setSite({
        title: String(s.title || "Медбиохим"),
        subtitle: String(s.subtitle || ""),
        description: String(s.description || ""),
        announcement_banner: String(s.announcement_banner || ""),
      });
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    setError(null);
    setOk(null);
    (async () => {
      if (tab === "announcements") {
        const res = await adminListAnnouncements();
        if (res.ok) setAnnouncements(res.data.items as Announcement[]);
      }
      if (tab === "schedule") {
        const res = await listSchedule();
        if (res.ok) setScheduleJson(JSON.stringify(res.data.items || [], null, 2));
      }
      if (tab === "curriculum") {
        const res = await adminGetCurriculum();
        if (res.ok) setCurriculumJson(JSON.stringify(res.data.items || [], null, 2));
      }
      if (tab === "tests") {
        const res = await adminGetTests();
        if (res.ok) setTestsJson(JSON.stringify(res.data.items || [], null, 2));
      }
      if (tab === "groups" || tab === "subjects") {
        const g = await listGroups();
        if (g.ok) setGroups(g.data.items as unknown[]);
        const s = await listSubjects();
        if (s.ok) setSubjects(s.data.items as unknown[]);
      }
      if (tab === "roles") {
        const res = await adminListUsers();
        if (res.ok) setUsers(res.data.items);
      }
    })();
  }, [tab]);

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Админ</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-block">
          Войти
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Админ-панель</h1>
        <p className="page-subtitle">{user?.name || user?.email || "Пользователь"}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {ok && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div>}

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="card">
              <div className="text-xs uppercase text-slate-500">{k}</div>
              <div className="text-2xl font-bold text-blue-600">{v}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "roles" && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const res = await claimAdmin(claimSecret);
              setBusy(false);
              if (!res.ok) setError(res.error.message);
              else {
                setOk("Admin: " + (res.data.roles || []).join(", "));
                await refresh();
                await loadOverview();
              }
            }}
            className="card max-w-lg space-y-3"
          >
            <h2 className="text-lg font-semibold">Стать админом</h2>
            <p className="text-sm text-slate-500">
              Секрет по умолчанию: <code>medbiohim-admin-2026</code>
            </p>
            <input
              value={claimSecret}
              onChange={(e) => setClaimSecret(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
            <button type="submit" disabled={busy} className="btn-primary">
              Выдать себе роль admin
            </button>
          </form>
          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Пользователи</h2>
            {users.length === 0 ? (
              <p className="text-sm text-slate-500">Список после получения admin</p>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{u.full_name || u.email}</div>
                      <div className="text-xs text-slate-500">{(u.roles || []).join(", ") || "—"}</div>
                    </div>
                    <div className="flex gap-1">
                      {["admin", "teacher", "student"].map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="rounded border bg-white px-2 py-1 text-xs"
                          onClick={async () => {
                            const res = await adminSetUserRole(u.id, r, "assign");
                            if (res.ok) {
                              setOk(`${r} → ${u.email}`);
                              const list = await adminListUsers();
                              if (list.ok) setUsers(list.data.items);
                            } else setError(res.error.message);
                          }}
                        >
                          +{r}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "site" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await adminUpdateSite(site);
            if (!res.ok) setError(res.error.message);
            else setOk("Сохранено");
          }}
          className="card max-w-xl space-y-3"
        >
          {(["title", "subtitle", "description", "announcement_banner"] as const).map((k) => (
            <div key={k}>
              <label className="text-sm text-slate-600">{k}</label>
              <input
                value={site[k]}
                onChange={(e) => setSite({ ...site, [k]: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          ))}
          <button type="submit" className="btn-primary">
            Сохранить
          </button>
        </form>
      )}

      {tab === "announcements" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await adminCreateAnnouncement(aTitle, aBody, false);
              if (!res.ok) setError(res.error.message);
              else {
                setATitle("");
                setABody("");
                setOk("Создано");
                const list = await adminListAnnouncements();
                if (list.ok) setAnnouncements(list.data.items as Announcement[]);
              }
            }}
            className="card space-y-3"
          >
            <input value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Заголовок" className="w-full rounded-xl border px-3 py-2 text-sm" required />
            <textarea value={aBody} onChange={(e) => setABody(e.target.value)} placeholder="Текст" rows={4} className="w-full rounded-xl border px-3 py-2 text-sm" required />
            <button type="submit" className="btn-primary">
              Опубликовать
            </button>
          </form>
          <div className="card space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-xl bg-slate-50 p-3">
                <div className="font-medium">{a.title}</div>
                <p className="text-sm text-slate-600">{a.body}</p>
                <button type="button" className="text-xs text-rose-600" onClick={async () => {
                  await adminDeleteAnnouncement(a.id);
                  const list = await adminListAnnouncements();
                  if (list.ok) setAnnouncements(list.data.items as Announcement[]);
                }}>Удалить</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            const items = JSON.parse(scheduleJson);
            const res = await saveSchedule(items);
            if (!res.ok) setError(res.error.message);
            else { setOk("Расписание сохранено"); setScheduleJson(JSON.stringify(res.data.items, null, 2)); }
          } catch { setError("Неверный JSON"); }
        }} className="card space-y-3">
          <p className="text-sm text-slate-500">Массив: day, start_time, end_time, subject, room, type</p>
          <textarea value={scheduleJson} onChange={(e) => setScheduleJson(e.target.value)} rows={14} className="w-full rounded-xl border px-3 py-2 font-mono text-xs" />
          <button type="submit" className="btn-primary">Сохранить расписание</button>
        </form>
      )}

      {tab === "curriculum" && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            const items = JSON.parse(curriculumJson);
            const res = await adminSaveCurriculum(items);
            if (!res.ok) setError(res.error.message);
            else { setOk("План сохранён"); setCurriculumJson(JSON.stringify(res.data.items, null, 2)); }
          } catch { setError("Неверный JSON"); }
        }} className="card space-y-3">
          <p className="text-sm text-slate-500">subject, course, semester, control, modules[].topics</p>
          <textarea value={curriculumJson} onChange={(e) => setCurriculumJson(e.target.value)} rows={14} className="w-full rounded-xl border px-3 py-2 font-mono text-xs" />
          <button type="submit" className="btn-primary">Сохранить план</button>
        </form>
      )}

      {tab === "tests" && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            const items = JSON.parse(testsJson);
            const res = await adminSaveTests(items);
            if (!res.ok) setError(res.error.message);
            else { setOk("Тесты сохранены"); setTestsJson(JSON.stringify(res.data.items, null, 2)); }
          } catch { setError("Неверный JSON"); }
        }} className="card space-y-3">
          <p className="text-sm text-slate-500">title, subject, type, questions[]</p>
          <textarea value={testsJson} onChange={(e) => setTestsJson(e.target.value)} rows={14} className="w-full rounded-xl border px-3 py-2 font-mono text-xs" />
          <button type="submit" className="btn-primary">Сохранить тесты</button>
        </form>
      )}

      {tab === "groups" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const res = await createGroup({ name: groupName, code: groupCode });
            if (!res.ok) setError(res.error.message);
            else { setOk("Группа создана"); const g = await listGroups(); if (g.ok) setGroups(g.data.items as unknown[]); }
          }} className="card space-y-3">
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Название" className="w-full rounded-xl border px-3 py-2 text-sm" required />
            <input value={groupCode} onChange={(e) => setGroupCode(e.target.value)} placeholder="Код" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <button type="submit" className="btn-primary">Создать</button>
          </form>
          <pre className="card overflow-auto text-xs">{JSON.stringify(groups, null, 2)}</pre>
        </div>
      )}

      {tab === "subjects" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const res = await createSubject({ name: subjectName, course_number: Number(subjectCourse) || 1 });
            if (!res.ok) setError(res.error.message);
            else { setOk("Предмет создан"); const s = await listSubjects(); if (s.ok) setSubjects(s.data.items as unknown[]); }
          }} className="card space-y-3">
            <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Название" className="w-full rounded-xl border px-3 py-2 text-sm" required />
            <input value={subjectCourse} onChange={(e) => setSubjectCourse(e.target.value)} placeholder="Курс" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <button type="submit" className="btn-primary">Создать</button>
          </form>
          <pre className="card overflow-auto text-xs">{JSON.stringify(subjects, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
