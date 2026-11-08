"use client";

/**
 * Инвайт-ссылка (Блок 8): студент открывает /invite/<token>, видит группу
 * и подаёт заявку; староста группы подтверждает её в кабинете группы.
 */
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, UsersRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";

type InviteInfo = {
  valid: boolean;
  group_name: string | null;
  reason: string | null;
  my_request: string | null;
  member: boolean;
};

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await api<{ data: InviteInfo }>(endpoints.block8.inviteInfo(token));
    if (result.ok) setInfo((result as any).data ?? (result as any).result?.data ?? null);
    else setError(describeApiError(result.error));
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [load, authLoading]);

  async function join() {
    setBusy(true);
    setError("");
    const result = await api(endpoints.block8.inviteJoin(token), { method: "POST", body: "{}" });
    setBusy(false);
    if (result.ok) {
      await load();
    } else {
      setError(describeApiError(result.error));
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <div className="card space-y-4 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
          <UsersRound className="h-7 w-7 text-indigo-600" />
        </div>
        {loading || authLoading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
          </div>
        ) : !user ? (
          <>
            <h1 className="page-title">Приглашение в группу</h1>
            <p className="page-subtitle">Войдите, чтобы присоединиться по ссылке.</p>
            <Link href="/login" className="btn-primary inline-flex">Войти</Link>
          </>
        ) : info && info.valid ? (
          <>
            <h1 className="page-title">{info.group_name || "Группа"}</h1>
            {info.member ? (
              <p className="page-subtitle">Вы уже состоите в этой группе.</p>
            ) : info.my_request === "pending" ? (
              <p className="page-subtitle">Заявка отправлена — староста группы её рассмотрит.</p>
            ) : info.my_request === "approved" ? (
              <p className="page-subtitle">Заявка подтверждена — обновите страницу расписания.</p>
            ) : (
              <>
                <p className="page-subtitle">Вас пригласили в учебную группу. Заявку подтвердит староста.</p>
                <button type="button" disabled={busy} onClick={() => void join()} className="btn-primary">
                  {busy ? "Отправляю…" : "Присоединиться"}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="page-title">Ссылка недействительна</h1>
            <p className="page-subtitle">{info?.reason || error || "Попросите администратора новую ссылку."}</p>
            <Link href="/" className="btn-secondary inline-flex">На главную</Link>
          </>
        )}
        {error && info?.valid && <div className="text-sm text-[var(--status-critical-fg)]">{error}</div>}
      </div>
    </main>
  );
}
