"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { addQuestionComment, deleteQuestionComment, listQuestionComments, type QuestionComment } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Обсуждение под вопросом «Базы вопросов» — перенос фичи старого портала:
 *  публичные комментарии с ролями, свои комментарии можно удалить. */
export default function QuestionComments({ questionId }: { questionId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<QuestionComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!questionId) return;
    listQuestionComments(questionId)
      .then((res: any) => {
        if (res?.ok) setItems(res.data?.items || []);
        else setError(res?.error?.message || "Не удалось загрузить обсуждение.");
      })
      .catch(() => setError("Не удалось загрузить обсуждение."));
  }, [questionId]);

  useEffect(() => {
    setItems(null);
    setError(null);
    load();
  }, [load]);

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await addQuestionComment(questionId, text).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setDraft("");
      load();
    } else {
      setError(res?.error?.message || "Не удалось отправить комментарий.");
    }
  }

  async function remove(id: string) {
    const res = await deleteQuestionComment(id).catch(() => null);
    if (res?.ok) setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
  }

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
        <MessageSquare className="size-3.5" /> Обсуждение
      </div>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {items == null ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="size-3.5 animate-spin" /> Загружаю…
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">Пока никто не написал. Задай вопрос или поделись mnemonic-ом.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((c) => (
            <li key={c.id} className="rounded-xl bg-white p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600">{c.author_name}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-400">
                  {formatTime(c.created_at)}
                  {user && c.user_id === user.id && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      title="Удалить свой комментарий"
                      className="text-slate-300 transition hover:text-rose-500"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-700">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <div className="mt-2.5 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            rows={2}
            maxLength={2000}
            placeholder="Добавить комментарий… (Ctrl+Enter — отправить)"
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Отправить
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Войдите, чтобы участвовать в обсуждении.</p>
      )}
    </div>
  );
}
