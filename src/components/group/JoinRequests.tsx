"use client";

/**
 * Заявки на вступление по инвайт-ссылкам (Блок 8) — блок старосты:
 * подтвердить/отклонить студента, подтверждённый попадает в группу.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";

type JoinRequest = { id: string; group_name: string | null; user_name: string; created_at: string };

export function JoinRequests() {
  const [items, setItems] = useState<JoinRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const result = await api<{ data: { items: JoinRequest[] } }>(endpoints.block8.groupJoinRequests());
    if (result.ok) setItems(((result as any).data?.items ?? (result as any).result?.data?.items ?? []));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    setNote("");
    const result = await api(endpoints.block8.groupJoinDecide(id), {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    setBusy("");
    if (result.ok) {
      setNote(decision === "approve" ? "Заявка подтверждена — студент в группе." : "Заявка отклонена.");
      setItems((current) => current.filter((x) => x.id !== id));
    } else {
      setNote(describeApiError(result.error));
    }
  }

  if (loaded && items.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Заявки на вступление">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Заявки на вступление</h2>
        <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Обновить
        </button>
      </div>
      {note && <div className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-700">{note}</div>}
      {!loaded && (
        <div className="flex items-center gap-2 p-3 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}
      {items.map((request) => (
        <div key={request.id} className="card flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{request.user_name}</div>
            <div className="text-xs text-[var(--muted)]">
              {request.group_name ? `${request.group_name} · ` : ""}
              {new Date(request.created_at).toLocaleString("ru-RU")}
            </div>
          </div>
          <button
            type="button"
            disabled={busy === request.id}
            onClick={() => void decide(request.id, "approve")}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Подтвердить
          </button>
          <button
            type="button"
            disabled={busy === request.id}
            onClick={() => void decide(request.id, "reject")}
            className="rounded-xl border px-3 py-1.5 text-xs font-semibold"
          >
            Отклонить
          </button>
        </div>
      ))}
    </section>
  );
}
