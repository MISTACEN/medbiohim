"use client";

import { Check, ClipboardList, Loader2, Lock, Send, Settings2, Users, X } from "lucide-react";

import type { GroupManageView } from "./useGroupManage";

/** Параметры группы: семестр, поток и запрос администратору на курс/год. */
export function GroupSettingsPanel({ gm }: { gm: GroupManageView }) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold"><Settings2 className="h-4 w-4" />Параметры группы</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Семестр</span>
          <input value={gm.groupForm.semester} onChange={(event) => gm.setGroupForm({ ...gm.groupForm, semester: event.target.value })} inputMode="numeric" className="w-full rounded-xl border border-[var(--border)] px-3 py-2" />
        </label>
        <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Поток (в пределах курса)</span>
          <input value={gm.groupForm.stream} onChange={(event) => gm.setGroupForm({ ...gm.groupForm, stream: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" />
        </label>
        <div className="flex items-end"><button type="button" onClick={() => void gm.saveGroup()} disabled={gm.busy === "group"} className="btn-primary inline-flex items-center gap-2 text-sm">{gm.busy === "group" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Сохранить</button></div>
      </div>
      <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-2 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" />Курс {gm.data.group.course_number ?? "—"} и год поступления {gm.data.group.admission_year ?? "—"} меняет только администратор по запросу.</p>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] p-3">
        <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Запрос администратору</span>
          <select value={gm.request.kind} onChange={(event) => gm.setRequest({ ...gm.request, kind: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2">
            <option value="course_change">Сменить курс</option>
            <option value="admission_year_change">Сменить год поступления</option>
          </select>
        </label>
        <input value={gm.request.value} onChange={(event) => gm.setRequest({ ...gm.request, value: event.target.value })} inputMode="numeric" placeholder={gm.request.kind === "course_change" ? "Новый курс" : "Новый год"} className="w-32 rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        <input value={gm.request.reason} onChange={(event) => gm.setRequest({ ...gm.request, reason: event.target.value })} placeholder="Причина" className="min-w-[160px] flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        <button type="button" onClick={() => void gm.sendRequest()} disabled={gm.busy === "request"} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold"><Send className="h-4 w-4" />Отправить</button>
      </div>
    </section>
  );
}

/** Состав группы: подгруппы и «заморозка» курса для академа/второгодничества. */
export function GroupMembersPanel({ gm }: { gm: GroupManageView }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-bold"><Users className="h-4 w-4" />Состав и подгруппы ({gm.data.members?.length || 0})</h2>
      <div className="space-y-2">
        {(gm.data.members || []).map((member: any) => (
          <div key={member.user_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
            <div className="min-w-0 flex-1">
              <b className="block truncate">{member.name}</b>
              <span className="text-[11px] text-slate-500">{member.role_in_group === "starosta" ? "староста" : member.email || "студент"} · курс {member.course_number ?? "—"}{member.course_source === "override" ? " (заморожен)" : ""}</span>
            </div>
            <input value={gm.subgroups[member.user_id] ?? ""} onChange={(event) => gm.setSubgroups((current) => ({ ...current, [member.user_id]: event.target.value }))} placeholder="Подгруппа" className="w-28 rounded-lg border border-[var(--border)] px-2 py-1 text-xs" />
            <button type="button" onClick={() => void gm.saveSubgroup(member.user_id)} disabled={gm.busy === member.user_id} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">OK</button>
            <button type="button" onClick={() => void gm.toggleCourseFreeze(member)} disabled={gm.courseBusy === member.user_id} title="Академотпуск или второгодничество: курс перестанет пересчитываться 1 сентября" className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold disabled:opacity-50">{gm.courseBusy === member.user_id ? "…" : member.course_source === "override" ? "Разморозить" : "Заморозить"}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Заявки на вступление в группу этой группы (внутри кабинета старосты). */
export function GroupJoinRequestsPanel({ gm }: { gm: GroupManageView }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-bold"><ClipboardList className="h-4 w-4" />Заявки на вступление ({gm.data.join_requests?.length || 0})</h2>
      {gm.data.join_requests?.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Новых заявок нет.</p> : (
        <div className="space-y-2">
          {gm.data.join_requests.map((join: any) => (
            <div key={join.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
              <div className="min-w-0 flex-1">
                <b className="block truncate">{join.name}</b>
                <span className="text-[11px] text-slate-500">{join.message || "без комментария"}</span>
              </div>
              <button type="button" onClick={() => void gm.reviewJoin(join.id, true)} disabled={gm.busy === join.id} className="rounded-lg bg-[var(--status-ok-fg)] px-2 py-1 text-xs font-semibold text-white">Принять</button>
              <button type="button" onClick={() => void gm.reviewJoin(join.id, false)} disabled={gm.busy === join.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold"><X className="h-3 w-3" />Отклонить</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Материалы группы в мастерской: скрыть/показать. */
export function GroupWorkshopPanel({ gm }: { gm: GroupManageView }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-bold">Материалы группы в мастерской ({gm.data.workshop_items?.length || 0})</h2>
      {gm.data.workshop_items?.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Материалов пока нет.</p> : (
        <div className="space-y-2">
          {gm.data.workshop_items.map((item: any) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
              <div className="min-w-0 flex-1"><b className="block truncate">{item.title}</b><span className="text-[11px] text-slate-500">{item.kind} · {item.status}</span></div>
              <button type="button" onClick={() => void gm.curateWorkshop(item.id, item.status !== "hidden")} disabled={gm.busy === item.id} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">{item.status === "hidden" ? "Показать" : "Скрыть"}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Домашние задания группы: правка названия и срока. */
export function GroupHomeworkPanel({ gm }: { gm: GroupManageView }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-bold">Домашние задания группы</h2>
      {gm.data.homeworks?.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">ДЗ пока нет.</p> : (
        <div className="space-y-2">
          {gm.data.homeworks.map((homework: any) => (
            <div key={homework.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-sm">
              <input value={gm.homeworkDrafts[homework.id]?.title ?? ""} onChange={(event) => gm.setHomeworkDrafts((current) => ({ ...current, [homework.id]: { ...(current[homework.id] || { due: "" }), title: event.target.value } }))} className="min-w-[180px] flex-1 rounded-lg border border-[var(--border)] px-2 py-1" />
              <input type="date" value={gm.homeworkDrafts[homework.id]?.due ?? ""} onChange={(event) => gm.setHomeworkDrafts((current) => ({ ...current, [homework.id]: { ...(current[homework.id] || { title: "" }), due: event.target.value } }))} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs" />
              <button type="button" onClick={() => void gm.saveHomework(homework.id)} disabled={gm.busy === homework.id} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">Сохранить</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
