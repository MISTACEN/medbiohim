"use client";

/**
 * Кабинет старосты: поток и подгруппы, семестр, ДЗ и заявки на вступление.
 * Курс и год поступления намеренно недоступны — на них отправляется запрос
 * администратору, чтобы не разорвать цепочку групп.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ClipboardList, Loader2, Lock, Send, Settings2, Users, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import {
  staffCapabilities, staffCreateRequest, staffGroupManage, staffReviewJoinRequest,
  staffUpdateGroup, staffUpdateGroupMember, staffUpdateHomework,
} from "@/lib/api/staff";
import { moderateWorkshopItem } from "@/lib/api/workshop";

export default function GroupManagePage() {
  const { user } = useAuth();
  const [capabilities, setCapabilities] = useState<any>(null);
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [groupForm, setGroupForm] = useState({ semester: "", stream: "" });
  const [subgroups, setSubgroups] = useState<Record<string, string>>({});
  const [courseBusy, setCourseBusy] = useState("");
  const [homeworkDrafts, setHomeworkDrafts] = useState<Record<string, { title: string; due: string }>>({});
  const [request, setRequest] = useState({ kind: "course_change", value: "", reason: "" });

  const load = useCallback(async (selected?: string) => {
    setLoading(true);
    setError("");
    const capabilitiesResult = await staffCapabilities();
    if (!capabilitiesResult.ok) { setError(describeApiError(capabilitiesResult.error)); setLoading(false); return; }
    setCapabilities(capabilitiesResult.data);
    const nextGroup = selected || groupId || capabilitiesResult.data.starosta_groups?.[0] || capabilitiesResult.data.groups?.[0]?.group_id || "";
    setGroupId(nextGroup);
    if (!nextGroup) { setLoading(false); return; }
    const manageResult = await staffGroupManage(nextGroup);
    if (!manageResult.ok) { setError(describeApiError(manageResult.error)); setLoading(false); return; }
    setData(manageResult.data);
    setGroupForm({ semester: String(manageResult.data.group?.semester ?? ""), stream: String(manageResult.data.group?.stream ?? "") });
    setSubgroups(Object.fromEntries((manageResult.data.members || []).map((member: any) => [member.user_id, member.subgroup || ""])));
    setHomeworkDrafts(Object.fromEntries((manageResult.data.homeworks || []).map((homework: any) => [homework.id, { title: homework.title || "", due: String(homework.due_at || homework.due_date || "").slice(0, 10) }])));
    setLoading(false);
  }, [groupId]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function saveGroup() {
    setBusy("group");
    const semester = Number(groupForm.semester);
    const result = await staffUpdateGroup(groupId, {
      semester: Number.isFinite(semester) && semester > 0 ? semester : undefined,
      stream: groupForm.stream || null,
    });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Параметры группы сохранены.");
    await load(groupId);
  }

  async function saveSubgroup(userId: string) {
    setBusy(userId);
    const result = await staffUpdateGroupMember(groupId, userId, { subgroup: subgroups[userId] || null });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Подгруппа обновлена.");
    await load(groupId);
  }

  async function toggleCourseFreeze(member: any) {
    const freeze = member.course_source !== "override";
    if (freeze && !member.course_number) { setError("Не из чего заморозить: курс не определён"); return; }
    setCourseBusy(member.user_id);
    const result = await staffUpdateGroupMember(groupId, member.user_id, {
      course_override: freeze ? Number(member.course_number) : null,
    });
    setCourseBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(freeze ? "Курс заморожен: академотпуск/второгодничество." : "Курс снова считается автоматически.");
    await load(groupId);
  }

  async function saveHomework(id: string) {
    setBusy(id);
    const draft = homeworkDrafts[id];
    const result = await staffUpdateHomework(groupId, id, {
      title: draft.title,
      due_at: draft.due ? `${draft.due} 23:59:00` : null,
    });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("ДЗ обновлено.");
    await load(groupId);
  }

  async function curateWorkshop(id: string, hide: boolean) {
    setBusy(id);
    const result = await moderateWorkshopItem(id, { action: hide ? "hide" : "unhide" });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(hide ? "Материал группы скрыт." : "Материал группы снова виден.");
    await load(groupId);
  }

  async function reviewJoin(id: string, approve: boolean) {
    setBusy(id);
    const result = await staffReviewJoinRequest(groupId, id, approve);
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(approve ? "Студент добавлен в группу." : "Заявка отклонена.");
    await load(groupId);
  }

  async function sendRequest() {
    const value = Number(request.value);
    if (!Number.isFinite(value) || value <= 0) { setError("Укажите новое значение"); return; }
    setBusy("request");
    const result = await staffCreateRequest({
      kind: request.kind as any,
      group_id: groupId,
      payload: request.kind === "course_change" ? { course_number: value } : { admission_year: value },
      reason: request.reason,
    });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Запрос отправлен администратору.");
    setRequest({ kind: "course_change", value: "", reason: "" });
  }

  const starosta = Boolean(capabilities?.starosta_groups?.length) || capabilities?.can?.admin;
  if (loading) return <div className="card flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загружаем группу…</div>;

  if (!starosta) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="page-title">Кабинет старосты</h1>
        <p className="page-subtitle">Доступен старосте группы. Роль назначает администратор.</p>
        <Link href="/subjects" className="btn-primary mt-4 inline-flex">К предметам</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Кабинет старосты</h1>
          <p className="page-subtitle">{data?.group?.display_name ? data.group.display_name + " · " : ""}Поток, подгруппы, семестр, ДЗ и заявки — без изменения курса и года поступления</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={groupId} onChange={(event) => void load(event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
            {(capabilities?.groups || []).map((group: any) => <option key={group.group_id} value={group.group_id}>{group.group_name || group.group_id}</option>)}
          </select>
          <Link href="/workshop" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Мастерская</Link>
        </div>
      </header>

      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{note}</div>}
      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      {data?.group && (
        <>
          <section className="card space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-bold"><Settings2 className="h-4 w-4" />Параметры группы</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Семестр</span>
                <input value={groupForm.semester} onChange={(event) => setGroupForm({ ...groupForm, semester: event.target.value })} inputMode="numeric" className="w-full rounded-xl border border-[var(--border)] px-3 py-2" />
              </label>
              <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Поток (в пределах курса)</span>
                <input value={groupForm.stream} onChange={(event) => setGroupForm({ ...groupForm, stream: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" />
              </label>
              <div className="flex items-end"><button type="button" onClick={() => void saveGroup()} disabled={busy === "group"} className="btn-primary inline-flex items-center gap-2 text-sm">{busy === "group" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Сохранить</button></div>
            </div>
            <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-2 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" />Курс {data.group.course_number ?? "—"} и год поступления {data.group.admission_year ?? "—"} меняет только администратор по запросу.</p>
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] p-3">
              <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Запрос администратору</span>
                <select value={request.kind} onChange={(event) => setRequest({ ...request, kind: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <option value="course_change">Сменить курс</option>
                  <option value="admission_year_change">Сменить год поступления</option>
                </select>
              </label>
              <input value={request.value} onChange={(event) => setRequest({ ...request, value: event.target.value })} inputMode="numeric" placeholder={request.kind === "course_change" ? "Новый курс" : "Новый год"} className="w-32 rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
              <input value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} placeholder="Причина" className="min-w-[160px] flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
              <button type="button" onClick={() => void sendRequest()} disabled={busy === "request"} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold"><Send className="h-4 w-4" />Отправить</button>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><Users className="h-4 w-4" />Состав и подгруппы ({data.members?.length || 0})</h2>
              <div className="space-y-2">
                {(data.members || []).map((member: any) => (
                  <div key={member.user_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <b className="block truncate">{member.name}</b>
                      <span className="text-[11px] text-slate-500">{member.role_in_group === "starosta" ? "староста" : member.email || "студент"} · курс {member.course_number ?? "—"}{member.course_source === "override" ? " (заморожен)" : ""}</span>
                    </div>
                    <input value={subgroups[member.user_id] ?? ""} onChange={(event) => setSubgroups((current) => ({ ...current, [member.user_id]: event.target.value }))} placeholder="Подгруппа" className="w-28 rounded-lg border border-[var(--border)] px-2 py-1 text-xs" />
                    <button type="button" onClick={() => void saveSubgroup(member.user_id)} disabled={busy === member.user_id} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">OK</button>
                    <button type="button" onClick={() => void toggleCourseFreeze(member)} disabled={courseBusy === member.user_id} title="Академотпуск или второгодничество: курс перестанет пересчитываться 1 сентября" className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold disabled:opacity-50">{courseBusy === member.user_id ? "…" : member.course_source === "override" ? "Разморозить" : "Заморозить"}</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><ClipboardList className="h-4 w-4" />Заявки на вступление ({data.join_requests?.length || 0})</h2>
              {data.join_requests?.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Новых заявок нет.</p> : (
                <div className="space-y-2">
                  {data.join_requests.map((join: any) => (
                    <div key={join.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <b className="block truncate">{join.name}</b>
                        <span className="text-[11px] text-slate-500">{join.message || "без комментария"}</span>
                      </div>
                      <button type="button" onClick={() => void reviewJoin(join.id, true)} disabled={busy === join.id} className="rounded-lg bg-[var(--status-ok-fg)] px-2 py-1 text-xs font-semibold text-white">Принять</button>
                      <button type="button" onClick={() => void reviewJoin(join.id, false)} disabled={busy === join.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold"><X className="h-3 w-3" />Отклонить</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="card p-4">
            <h2 className="mb-3 font-bold">Материалы группы в мастерской ({data.workshop_items?.length || 0})</h2>
            {data.workshop_items?.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Материалов пока нет.</p> : (
              <div className="space-y-2">
                {data.workshop_items.map((item: any) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
                    <div className="min-w-0 flex-1"><b className="block truncate">{item.title}</b><span className="text-[11px] text-slate-500">{item.kind} · {item.status}</span></div>
                    <button type="button" onClick={() => void curateWorkshop(item.id, item.status !== "hidden")} disabled={busy === item.id} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">{item.status === "hidden" ? "Показать" : "Скрыть"}</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-bold">Домашние задания группы</h2>
            {data.homeworks?.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">ДЗ пока нет.</p> : (
              <div className="space-y-2">
                {data.homeworks.map((homework: any) => (
                  <div key={homework.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
                    <input value={homeworkDrafts[homework.id]?.title ?? ""} onChange={(event) => setHomeworkDrafts((current) => ({ ...current, [homework.id]: { ...(current[homework.id] || { due: "" }), title: event.target.value } }))} className="min-w-[180px] flex-1 rounded-lg border border-[var(--border)] px-2 py-1" />
                    <input type="date" value={homeworkDrafts[homework.id]?.due ?? ""} onChange={(event) => setHomeworkDrafts((current) => ({ ...current, [homework.id]: { ...(current[homework.id] || { title: "" }), due: event.target.value } }))} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs" />
                    <button type="button" onClick={() => void saveHomework(homework.id)} disabled={busy === homework.id} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">Сохранить</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
