"use client";

/**
 * Тревожная кнопка (Блок 8): студент одним сообщением сообщает админу
 * о срочной проблеме. Пара кликов из любого раздела; антифлуд на сервере.
 */
import { useState } from "react";
import { Siren, Loader2, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";

export function SosButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    setResult("");
    const response = await api(endpoints.block8.sos(), {
      method: "POST",
      body: JSON.stringify({ message: message.trim(), page_url: window.location.pathname }),
    });
    setBusy(false);
    if (response.ok) {
      setResult("Отправлено — администратор уже видит обращение.");
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setResult("");
      }, 2500);
    } else {
      setResult(describeApiError(response.error));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all hover:bg-white/10"
        style={{ color: "var(--status-warn-fg)" }}
        title="Срочно сообщить администратору"
      >
        <Siren className="h-5 w-5 shrink-0" strokeWidth={2} />
        <span>Тревожная кнопка</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-[var(--card)] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Siren className="h-5 w-5" style={{ color: "var(--status-warn-fg)" }} /> Тревожная кнопка
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Закрыть">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Опишите проблему — сообщение с текущей страницей уйдёт администратору. Не пишите сюда пароли.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-24 w-full rounded-xl border p-3 text-sm"
              placeholder="Что случилось?"
              maxLength={2000}
              autoFocus
            />
            {result && <div className="text-sm text-indigo-700">{result}</div>}
            <button
              type="button"
              disabled={busy || !message.trim()}
              onClick={() => void send()}
              className="btn-primary inline-flex w-full items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
              Отправить
            </button>
          </div>
        </div>
      )}
    </>
  );
}
