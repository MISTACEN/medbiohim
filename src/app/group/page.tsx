"use client";

/**
 * Кабинет старосты: поток и подгруппы, семестр, ДЗ и заявки на вступление.
 * Курс и год поступления намеренно недоступны — на них отправляется запрос
 * администратору, чтобы не разорвать цепочку групп.
 *
 * Состояние — в useGroupManage, панели данных группы — в GroupManagePanels.
 */
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { JoinRequests } from "@/components/group/JoinRequests";
import { useGroupManage } from "@/components/group/useGroupManage";
import {
  GroupHomeworkPanel,
  GroupJoinRequestsPanel,
  GroupMembersPanel,
  GroupSettingsPanel,
  GroupWorkshopPanel,
} from "@/components/group/GroupManagePanels";

export default function GroupManagePage() {
  const gm = useGroupManage();

  if (gm.loading) return <div className="card flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загружаем группу…</div>;

  if (!gm.starosta) {
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
          <p className="page-subtitle">{gm.data?.group?.display_name ? gm.data.group.display_name + " · " : ""}Поток, подгруппы, семестр, ДЗ и заявки — без изменения курса и года поступления</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={gm.groupId} onChange={(event) => void gm.load(event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
            {(gm.capabilities?.groups || []).map((group: any) => <option key={group.group_id} value={group.group_id}>{group.group_name || group.group_id}</option>)}
          </select>
          <Link href="/workshop" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Мастерская</Link>
        </div>
      </header>

      <JoinRequests />

      {gm.note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{gm.note}</div>}
      {gm.error && <div className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{gm.error}</div>}

      {gm.data?.group && (
        <>
          <GroupSettingsPanel gm={gm} />

          <div className="grid gap-4 xl:grid-cols-2">
            <GroupMembersPanel gm={gm} />
            <GroupJoinRequestsPanel gm={gm} />
          </div>

          <GroupWorkshopPanel gm={gm} />

          <GroupHomeworkPanel gm={gm} />
        </>
      )}
    </div>
  );
}
