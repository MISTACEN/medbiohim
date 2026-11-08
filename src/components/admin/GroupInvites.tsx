"use client";

/**
 * Инвайт-ссылки группы (Блок 8): админ создаёт ссылку /invite/<token>,
 * отзывает и копирует. Заявки подтверждает староста группы.
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, Plus, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";

type Invite = { id: string; token: string; expires_at: string | null; revoked_at: string | null; uses: number; max_uses: number | null };

export function GroupInvites({ groupId }: { groupId: string }) {
  const [items, setItems] = useState<Invite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!groupId) return;
    const result = await api<{ data: { items: Invite[] } }>(endpoints.block8.groupInvites(groupId));
    if (result.ok) setItems(((result as any).data?.items ?? (result as any).result?.data?.items ?? []));
    setLoaded(true);
  }, [groupId]);

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setNote("");
    const result = await api(endpoints.block8.groupInvites(groupId), {
      method: "POST",
      body: JSON.stringify({ expires_in_days: 30 }),
    });
    setBusy(false);
    if (result.ok) {
      setNote("Ссылка создана.");
      await load();
    } else {
      setNote(describeApiError(result.error));
    }
  }

  async function revoke(inviteId: string) {
    setNote("");
    const result = await api(endpoints.block8.groupInviteRevoke(inviteId), { method: "DELETE" });
    if (result.ok) {
      setNote("Ссылка отозвана.");
      await load();
    } else {
      setNote(describeApiError(result.error));
    }
  }

  const inviteUrl = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : `/invite/${token}`;

  return (
    <section className="card space-y-3 p-4" aria-label="Инвайт-ссылки">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <Link2 className="h-5 w-5 text-indigo-600" /> Инвайт-ссылки
        </h2>
        <button type="button" disabled={busy} onClick={() => void create()} className="btn-secondary inline-flex items-center gap-1 text-xs">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Создать ссылку (30 дней)
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Студент открывает ссылку и подаёт заявку; подтверждает её староста группы в «Кабинете старосты».
      </p>
      {note && <div className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-700">{note}</div>}
      {!loaded && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}
      {loaded && items.length === 0 && <div className="text-sm text-[var(--muted)]">Ссылок пока нет.</div>}
      <div className="space-y-2">
        {items.map((invite) => {
          const active = !invite.revoked_at && (!invite.expires_at || Date.parse(invite.expires_at) > Date.now());
          return (
            <div key={invite.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
              <span className={"rounded-full px-2 py-0.5 font-semibold " + (active ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-slate-200 text-slate-500")}>
                {active ? "активна" : "отозвана"}
              </span>
              <code className="min-w-0 flex-1 truncate">{inviteUrl(invite.token)}</code>
              <span className="text-[var(--muted)]">использований: {invite.uses}{invite.max_uses != null ? `/${invite.max_uses}` : ""}</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(inviteUrl(invite.token))}
                className="rounded-lg border px-2 py-1 font-semibold"
                title="Скопировать ссылку"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {active && (
                <button type="button" onClick={() => void revoke(invite.id)} className="rounded-lg border px-2 py-1 font-semibold" title="Отозвать">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
