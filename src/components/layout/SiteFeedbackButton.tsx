"use client";

/**
 * «Жалоба на ошибку на сайте» (замена тревожной кнопки): студент сообщает
 * о проблеме платформы — контент, тест, сломанная функция. Обращение уходит
 * в тот же пайплайн sos_reports (админ-вью /admin/problems), но с категорией.
 * Видят только студенты: teacher/admin/moderator скрываются в самом компоненте.
 */
import { useState } from "react";
import { Flag, Loader2, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";

const CATEGORIES = [
  { value: "content", label: "Ошибка в материалах" },
  { value: "test", label: "Ошибка в тесте/вопросе" },
  { value: "broken", label: "Не работает функция" },
  { value: "typo", label: "Опечатка" },
  { value: "other", label: "Другое" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export function SiteFeedbackButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("content");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  // Кнопка адресована студентам: у персонала есть админ-инструменты.
  if (!user || user.role === "teacher" || user.role === "admin" || user.role === "moderator") {
    return null;
  }

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    setResult("");
    const response = await api(endpoints.block8.sos(), {
      method: "POST",
      body: JSON.stringify({
        message: message.trim(),
        category,
        page_url: window.location.pathname,
      }),
    });
    setBusy(false);
    if (response.ok) {
      setResult("Отправлено — администратор уже видит обращение.");
      setMessage("");
      setCategory("content");
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
        title="Сообщить об ошибке на сайте"
      >
        <Flag className="h-5 w-5 shrink-0" strokeWidth={2} />
        <span>Жалоба на ошибку на сайте</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-[var(--card)] p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Flag className="h-5 w-5" style={{ color: "var(--status-warn-fg)" }} /> Жалоба на ошибку на сайте
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Закрыть">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Категория проблемы">
              {CATEGORIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={category === item.value}
                  onClick={() => setCategory(item.value)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                    (category === item.value
                      ? "border-transparent bg-[var(--primary)] text-white"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-24 w-full rounded-xl border p-3 text-sm"
              placeholder="Опишите проблему — адрес текущей страницы приложится автоматически. Не пишите сюда пароли."
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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Отправить жалобу
            </button>
          </div>
        </div>
      )}
    </>
  );
}
