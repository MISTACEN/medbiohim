"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  adminListAnnouncements,
  adminOverview,
  adminUpdateSite,
  createGroup,
  createSubject,
  listGroups,
  listSubjects,
} from "@/lib/api";

type Tab = "overview" | "site" | "announcements" | "groups" | "subjects";
type Announcement = { id: string; title: string; body: string; pinned?: boolean; created_at?: string };

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ announcements: 0, groups: 0, subjects: 0 });
  const [site, setSite] = useState({
    title: "Медбиохим",
    subtitle: "образовательная платформа",
    description: "",
    announcement_banner: "",
    contacts: { email: "", phone: "", address: "" },
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [aTitle, setATitle] = useState("");
  const [aBody, setABody] = useState("");
  const [aPinned, setAPinned] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectCourse, setSubjectCourse] = useState("1");
  const [groups, setGroups] = useState<unknown[]>([]);
  const [subjects, setSubjects] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadOverview() {
    setError(null);
    try {
      const res = await adminOverview();
      if (!res.ok) {
        setError(res.error.message + " — нужен вход с ролью teacher/moderator/admin");
        return;
      }
      setCounts(res.data.counts);
      const s = res.data.site as typeof site;
      setSite({
        title: String(s.title || "Медбиохим"),
        subtitle: String(s.subtitle || ""),
        description: String(s.description || ""),
        announcement_banner: String(s.announcement_banner || ""),
        contacts: {
          email: String((s.contacts as { email?: string })?.email || ""),
          phone: String((s.contacts as { phone?: string })?.phone || ""),
          address: String((s.contacts as { address?: string })?.address || ""),
        },
      });
    } catch {
      setError("API недоступен или нет авторизации");
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (tab === "announcements") {
      adminListAnnouncements().then((res) => {
        if (res.ok) setAnnouncements(res.data.items);
      });
    }
    if (tab === "groups" || tab === "subjects") {
      listGroups().then((g) => {
        if (g.ok) setGroups(g.data.items as unknown[]);
      });
      listSubjects().then((s) => {
        if (s.ok) setSubjects(s.data.items as unknown[]);
      });
    }
  }, [tab]);

  async function saveSite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    setError(null);
    const res = await adminUpdateSite({
      title: site.title,
      subtitle: site.subtitle,
      description: site.description,
      announcement_banner: site.announcement_banner,
      contacts: site.contacts,
    });
    setBusy(false);
    if (!res.ok) setError(res.error.message);
    else setNote("Настройки сайта сохранены");
  }

  async function addAnnouncement(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await adminCreateAnnouncement(aTitle, aBody, aPinned);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setATitle("");
    setABody("");
    setAPinned(false);
    setNote("Объявление добавлено");
    const list = await adminListAnnouncements();
    if (list.ok) setAnnouncements(list.data.items);
    loadOverview();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Обзор" },
    { id: "site", label: "Сайт" },
    { id: "announcements", label: "Объявления" },
    { id: "groups", label: "Группы" },
    { id: "subjects", label: "Предметы" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Админ-панель</h1>
          <p className="page-subtitle">Контент и справочники · роль teacher / moderator / admin</p>
        </div>
        <Link href="/" className="text-sm font-medium text-primary hover:underline">← На главную</Link>
      </div>

      {(error || note) && (
        <div className={`rounded-soft px-4 py-3 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>
          {error || note}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => { setTab(t.id); setNote(null); setError(null); }}
            className={`rounded-soft px-3 py-1.5 text-sm font-medium transition ${tab === t.id ? "bg-brand-gradient text-white shadow-card" : "border border-slate-200 bg-white text-slate-600 hover:bg-indigo-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card"><div className="text-xs uppercase tracking-wide text-slate-500">Объявления</div><div className="mt-1 text-2xl font-bold">{counts.announcements}</div></div>
          <div className="card"><div className="text-xs uppercase tracking-wide text-slate-500">Группы</div><div className="mt-1 text-2xl font-bold">{counts.groups}</div></div>
          <div className="card"><div className="text-xs uppercase tracking-wide text-slate-500">Предметы</div><div className="mt-1 text-2xl font-bold">{counts.subjects}</div></div>
        </div>
      )}

      {tab === "site" && (
        <form onSubmit={saveSite} className="card space-y-4">
          <h2 className="font-semibold">Информация о сайте</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Название<input className="mt-1 w-full rounded-soft border px-3 py-2 text-sm" value={site.title} onChange={(e) => setSite({ ...site, title: e.target.value })} /></label>
            <label className="block text-sm">Подзаголовок<input className="mt-1 w-full rounded-soft border px-3 py-2 text-sm" value={site.subtitle} onChange={(e) => setSite({ ...site, subtitle: e.target.value })} /></label>
          </div>
          <label className="block text-sm">Описание<textarea rows={3} className="mt-1 w-full rounded-soft border px-3 py-2 text-sm" value={site.description} onChange={(e) => setSite({ ...site, description: e.target.value })} /></label>
          <label className="block text-sm">Баннер<input className="mt-1 w-full rounded-soft border px-3 py-2 text-sm" value={site.announcement_banner} onChange={(e) => setSite({ ...site, announcement_banner: e.target.value })} /></label>
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">Сохранить</button>
        </form>
      )}

      {tab === "announcements" && (
        <div className="space-y-4">
          <form onSubmit={addAnnouncement} className="card space-y-3">
            <h2 className="font-semibold">Новое объявление</h2>
            <input required placeholder="Заголовок" className="w-full rounded-soft border px-3 py-2 text-sm" value={aTitle} onChange={(e) => setATitle(e.target.value)} />
            <textarea required rows={3} placeholder="Текст" className="w-full rounded-soft border px-3 py-2 text-sm" value={aBody} onChange={(e) => setABody(e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={aPinned} onChange={(e) => setAPinned(e.target.checked)} /> Закрепить</label>
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">Опубликовать</button>
          </form>
          {announcements.map((a) => (
            <div key={a.id} className="card flex justify-between gap-3">
              <div>
                <div className="font-medium">{a.pinned ? "📌 " : ""}{a.title}</div>
                <p className="mt-1 text-sm text-slate-600">{a.body}</p>
              </div>
              <button type="button" className="text-sm text-rose-600 hover:underline" onClick={async () => {
                if (!confirm("Удалить?")) return;
                await adminDeleteAnnouncement(a.id);
                const list = await adminListAnnouncements();
                if (list.ok) setAnnouncements(list.data.items);
              }}>Удалить</button>
            </div>
          ))}
        </div>
      )}

      {tab === "groups" && (
        <div className="space-y-4">
          <form onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await createGroup({ name: groupName, code: groupCode || undefined });
            setBusy(false);
            if (!res.ok) setError(res.error.message);
            else { setNote("Группа создана"); setGroupName(""); setGroupCode(""); loadOverview(); listGroups().then((g) => g.ok && setGroups(g.data.items as unknown[])); }
          }} className="card flex flex-wrap gap-2">
            <input required placeholder="Название" className="rounded-soft border px-3 py-2 text-sm" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <input placeholder="Код" className="rounded-soft border px-3 py-2 text-sm" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} />
            <button type="submit" className="btn-primary">Добавить</button>
          </form>
          <ul className="card divide-y p-0">{(groups as Array<{ name?: string; code?: string }>).map((g, i) => (
            <li key={i} className="px-4 py-3 text-sm"><span className="font-medium">{g.name}</span>{g.code && <span className="ml-2 text-slate-500">{g.code}</span>}</li>
          ))}</ul>
        </div>
      )}

      {tab === "subjects" && (
        <div className="space-y-4">
          <form onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await createSubject({ name: subjectName, course_number: Number(subjectCourse) || 1 });
            setBusy(false);
            if (!res.ok) setError(res.error.message);
            else { setNote("Предмет создан"); setSubjectName(""); loadOverview(); listSubjects().then((s) => s.ok && setSubjects(s.data.items as unknown[])); }
          }} className="card flex flex-wrap gap-2">
            <input required placeholder="Предмет" className="rounded-soft border px-3 py-2 text-sm" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
            <select className="rounded-soft border px-3 py-2 text-sm" value={subjectCourse} onChange={(e) => setSubjectCourse(e.target.value)}>
              {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Курс {n}</option>)}
            </select>
            <button type="submit" className="btn-primary">Добавить</button>
          </form>
          <ul className="card divide-y p-0">{(subjects as Array<{ name?: string; course_number?: number }>).map((s, i) => (
            <li key={i} className="px-4 py-3 text-sm"><span className="font-medium">{s.name}</span>{s.course_number != null && <span className="ml-2 text-slate-500">· курс {s.course_number}</span>}</li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}
