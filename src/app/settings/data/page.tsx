"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { describeApiError } from "@/lib/errors";
import {
  cancelAccountDeletion,
  downloadMyData,
  formatAccountDate,
  getAccountDeletion,
  requestAccountDeletion,
  type AccountDeletionState,
} from "@/lib/features-api";

/**
 * Состав выгрузки. Список статический и совпадает с разделами
 * `GET /api/v1/account/export`: обещать в интерфейсе больше, чем отдаёт сервер,
 * нельзя. Если состав изменится на сервере — меняется и этот список.
 */
const EXPORT_SECTIONS = [
  "Профиль, почта и роли",
  "Учебные группы и роль в группе",
  "Настройки интерфейса",
  "Прогресс по предметам и темам",
  "Карточки повторения (SRS)",
  "Попытки тестов, баллы и статусы",
  "Личные заметки",
  "Избранное",
  "Сданные работы, оценки и комментарии преподавателя",
  "Трекер отработок",
  "Учебные сессии",
  "Посещаемость занятий",
  "История AI-чатов и сообщений",
  "Личный календарь из iCal",
  "Комментарии к вопросам",
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 КБ";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function AccountDataPage() {
  const { confirm, dialog } = useConfirm();
  const [deletion, setDeletion] = useState<AccountDeletionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState<"download" | "request" | "cancel" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getAccountDeletion();
    if (result.ok) {
      setDeletion(result.data);
    } else {
      setDeletion(null);
      setLoadError({ message: describeApiError(result.error), requestId: result.requestId });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDownload() {
    setBusy("download");
    setNotice(null);
    setActionError(null);
    const result = await downloadMyData();
    setBusy(null);
    if (!result.ok) {
      // Ошибку сервера показываем как есть: файл не создан — значит, не «готово».
      setActionError(result.message);
      return;
    }
    setNotice(`Файл ${result.filename} сохранён (${formatBytes(result.bytes)}).`);
  }

  async function onRequestDeletion() {
    const approved = await confirm({
      title: "Запросить удаление аккаунта?",
      description:
        "Аккаунт будет помечен к удалению и останется рабочим весь grace-период. " +
        "Передумать можно кнопкой «Отменить удаление» — до даты исполнения.",
      confirmLabel: "Запросить удаление",
      cancelLabel: "Не сейчас",
      danger: true,
    });
    if (!approved) return;
    setBusy("request");
    setNotice(null);
    setActionError(null);
    const result = await requestAccountDeletion(reason.trim() || undefined);
    setBusy(null);
    if (!result.ok) {
      setActionError(describeApiError(result.error));
      return;
    }
    setDeletion(result.data);
    setReason("");
    setReasonOpen(false);
    setNotice(
      result.data.status === "already_requested"
        ? "Запрос на удаление уже был создан — показываем его дату."
        : "Запрос создан. До даты исполнения аккаунт работает как обычно."
    );
  }

  async function onCancelDeletion() {
    const approved = await confirm({
      title: "Отменить удаление аккаунта?",
      description: "Запрос будет закрыт, аккаунт и все данные останутся на месте.",
      confirmLabel: "Отменить удаление",
      cancelLabel: "Оставить как есть",
    });
    if (!approved) return;
    setBusy("cancel");
    setNotice(null);
    setActionError(null);
    const result = await cancelAccountDeletion();
    setBusy(null);
    if (!result.ok) {
      setActionError(describeApiError(result.error));
      // Отмена могла не пройти, потому что запрос уже исполнен: обновляем статус.
      await load();
      return;
    }
    setDeletion(result.data);
    setNotice("Удаление отменено. Аккаунт остаётся активным.");
  }

  const status = deletion?.status ?? null;
  // `already_requested` приходит на повторный запрос: активный запрос уже есть,
  // поэтому показываем тот же блок с датой исполнения и кнопкой отмены.
  const scheduled = status === "scheduled" || status === "already_requested";
  const executed = status === "executed" || deletion?.deletion_executed === true;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm">
            <Link href="/settings" className="inline-flex items-center gap-1 text-[var(--muted)] hover:underline">
              <ArrowLeft className="h-4 w-4" /> Настройки
            </Link>
          </div>
          <h1 className="page-title">Данные и аккаунт</h1>
          <p className="page-subtitle">Скачивание личных данных и удаление аккаунта с grace-периодом</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} /> Обновить
        </button>
      </div>

      {(notice || actionError) && (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm",
            actionError
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
          role="status"
        >
          {actionError || notice}
        </div>
      )}

      <section className="card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}
          >
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Скачать мои данные</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Один JSON-файл: профиль, прогресс, карточки повторения, попытки тестов, заметки,
              избранное, сданные работы и остальные личные записи. Выгрузка только читает данные —
              ничего не удаляет и не меняет.
            </p>
          </div>
        </div>

        <ul className="grid gap-x-6 gap-y-1 text-sm text-[var(--muted)] sm:grid-cols-2">
          {EXPORT_SECTIONS.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
          Чего в файле нет и почему: разделы ограничены по числу строк (признак «обрезано» виден в самом
          файле), анонимная статистика переходов на внешние платформы не привязана к пользователю, а
          тренировки по гистологии выдаются только серверными функциями без табличного контракта. Файл
          собирается из нескольких параллельных запросов, поэтому снимок может отличаться на несколько секунд.
        </div>

        <button
          type="button"
          onClick={() => void onDownload()}
          disabled={busy !== null}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
        >
          {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy === "download" ? "Собираем файл…" : "Скачать мои данные"}
        </button>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Удаление аккаунта</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Удаление не выполняется сразу и не выполняется из интерфейса: сначала фиксируется запрос,
              затем действует grace-период, и только после его окончания аккаунт удаляет служебный процесс.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем статус запроса…
          </div>
        ) : loadError ? (
          <ErrorState
            title="Не удалось загрузить статус удаления"
            message={loadError.message}
            requestId={loadError.requestId}
            retry={() => void load()}
            compact
          />
        ) : executed ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <div className="font-semibold">Аккаунт помечен как удалённый</div>
            <p className="mt-1">
              Запрос исполнен {formatAccountDate(deletion?.executed_at)}. Отменить его нельзя. Если это
              произошло по ошибке — напишите в поддержку.
            </p>
          </div>
        ) : scheduled ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4" /> Удаление запланировано
              </div>
              <p className="mt-1">
                Дата исполнения: <b>{formatAccountDate(deletion?.scheduled_for)}</b>
                {typeof deletion?.days_left === "number"
                  ? ` · осталось ${deletion.days_left} дн.`
                  : ""}
              </p>
              <p className="mt-1">
                Запрос создан {formatAccountDate(deletion?.requested_at)}
                {deletion?.grace_days ? `, срок — ${deletion.grace_days} дн.` : ""}. До этой даты аккаунт
                работает как обычно.
              </p>
            </div>
            <p className="text-sm text-[var(--muted)]">{deletion?.message}</p>
            {deletion?.execution_configured === false && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Автоматическое удаление не настроено
                </div>
                <p className="mt-1">
                  Запрос сохранён, но на сервере нет служебного ключа, который удаляет аккаунты. Дата
                  исполнения не наступит сама — напишите в поддержку, чтобы удаление выполнили вручную.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => void onCancelDeletion()}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
            >
              {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy === "cancel" ? "Отменяем…" : "Отменить удаление"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {status === "cancelled" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Предыдущий запрос отменён {formatAccountDate(deletion?.cancelled_at)}. Аккаунт активен.
              </div>
            )}
            <p className="text-sm text-[var(--muted)]">
              {deletion?.grace_days
                ? `После запроса аккаунт удаляется через ${deletion.grace_days} дн. Всё это время его можно отменить.`
                : "После запроса действует grace-период, в течение которого удаление можно отменить."}
            </p>

            {reasonOpen ? (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Причина (необязательно)</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value.slice(0, 1000))}
                  rows={3}
                  maxLength={1000}
                  placeholder="Поможет нам понять, что улучшить. Ни на что не влияет."
                  className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none"
                />
                <span className="block text-xs text-[var(--muted)]">{reason.length} / 1000</span>
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setReasonOpen(true)}
                className="text-sm text-[var(--muted)] underline"
              >
                Добавить причину удаления
              </button>
            )}

            <button
              type="button"
              onClick={() => void onRequestDeletion()}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {busy === "request" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              {busy === "request" ? "Создаём запрос…" : "Запросить удаление аккаунта"}
            </button>
            <p className="text-xs text-[var(--muted)]">
              Перед удалением скачайте данные: после исполнения запроса восстановить их нельзя.
            </p>
          </div>
        )}
      </section>

      <section className="card space-y-2 p-5 text-sm text-[var(--muted)]">
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
          Кто и когда удаляет аккаунт
        </h2>
        <p>1. Запрос сохраняется в базе и виден вам на этой странице — вместе с датой исполнения.</p>
        <p>2. До даты исполнения запрос можно отменить в любой момент, данные остаются нетронутыми.</p>
        <p>
          3. После даты аккаунт удаляет служебный процесс с административными правами. В интерфейсе нет
          кнопки «удалить сейчас» намеренно: это защита от случайной потери прогресса.
        </p>
      </section>

      {dialog}
    </div>
  );
}
