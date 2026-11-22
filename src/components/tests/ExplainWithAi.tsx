"use client";

/**
 * «Объяснить · ИИ» — разбор ошибки в один клик (Фаза 3 дорожной карты).
 *
 * Шлёт в /ai/chat текст вопроса, выбранный и правильный ответ, режим «точный»
 * (RAG по лекциям предмета) и показывает разбор со сносками [N], ведущими в
 * лекции. Ничего не сохраняет: это разовая подсказка.
 *
 * Разбор — не приговор: ключ теста тоже может ошибаться, поэтому промпт требует
 * сначала проверить и ответ студента, и ключ, а не защищать ключ. Ответ
 * рендерится markdown-ом (таблицы, списки), к нему прикладываются реальные
 * фото препаратов курса и можно задать уточняющий вопрос — одним компонентом,
 * без перехода в чат.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { aiChat, type AiAnswerImage, type AiProvider } from "@/lib/features-api";
import { getTrainerImageUrl } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { getAccountSettings } from "@/lib/settings-api";
import { AnswerSources } from "@/components/ai/AnswerSources";
import { mdToHtml } from "@/lib/lectures/markdown";
import { stripInlineSourceList } from "@/components/tutor/model";

/** Провайдер из настроек аккаунта; один запрос на страницу. */
let explainProviderPromise: Promise<AiProvider> | null = null;
function savedExplainProvider(): Promise<AiProvider> {
  if (!explainProviderPromise) {
    explainProviderPromise = getAccountSettings()
      .then((r) => {
        const value = String((r.ok ? (r.data.preferences as Record<string, unknown>)?.ai_explain_provider : "auto") || "auto");
        return (["gigachat", "groq", "mistral", "openai", "openrouter", "custom"].includes(value)
          ? value
          : "auto") as AiProvider;
      })
      .catch(() => "auto" as AiProvider);
  }
  return explainProviderPromise;
}

/** Сообщение для модели: вопрос, оба ответа и требование проверить ключ. */
function initialPrompt({
  question, chosen, correct, subjectName, review, clarify, options,
}: {
  question: string;
  chosen?: string;
  correct?: string;
  subjectName?: string | null;
  review: boolean;
  clarify?: boolean;
  options?: string[];
}) {
  const context = subjectName ? ` по предмету «${subjectName}»` : "";
  const common = [
    "Проверь себя перед ответом: факты верны по сути, противоречий внутри разбора нет.",
    "Оформи markdown-ом: прямая мысль, затем пункты механизма, в конце одна мнемоника.",
    "Ставь сноску [N] после утверждений из фрагментов.",
  ];
  // «Не понял вопрос» прямо во время теста: объясняем смысл и термины, но не
  // отдаём готовый вариант — иначе прохождение теста теряет смысл.
  if (clarify) {
    return [
      `Помоги разобраться с тестовым вопросом${context}: я ещё не отвечал и не хочу видеть готовый ответ.`,
      `Вопрос: ${question}`,
      options?.length ? `Варианты:\n${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}` : "",
      "Объясни простыми словами, что именно спрашивают, и что значит каждый термин и каждый вариант.",
      "Не называй правильный вариант и не подсказывай, какой выбрать — я решу сам.",
      ...common,
    ].filter(Boolean).join("\n");
  }
  if (review) {
    return [
      `Разбери тестовый вопрос${context}: к нему нет ключа в источнике.`,
      `Вопрос: ${question}`,
      chosen ? `Мой выбор: ${chosen}` : "",
      "Скажи, какой вариант верен и почему, и что именно проверяет вопрос.",
      "Если мой выбор защитим по существу — скажи это прямо, а не подгоняй разбор под воображаемый ключ.",
      ...common,
    ].filter(Boolean).join("\n");
  }
  return [
    `Разбери мою ошибку в тесте${context}.`,
    `Вопрос: ${question}`,
    chosen ? `Мой ответ: ${chosen}` : "",
    correct ? `Ответ в ключе: ${correct}` : "",
    "Сначала сам проверь и мой ответ, и ключ — по факту, а не по формулировке.",
    "Начни ответ ровно с одного вердикта: «**Ключ верен.**», «**В ключе ошибка: ваш ответ вернее.**» "
      + "или «**Оба ответа неверны: правильный — …**» — и только потом разбор.",
    "Не защищай мой ответ: если он неверен, скажи это прямо, даже когда ключ тоже неверен."
      + " «Ваш ответ вернее» — только если мой вариант действительно правильный по механизму.",
    "Если ключ прав — покажи, где именно ошибка в моём ответе.",
    ...common,
  ].filter(Boolean).join("\n");
}

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Ответ модели в markdown. Берём чистый mdToHtml, а не TutorMarkdown: тот тянет
 * KaTeX/Mermaid и весь рендерер лекций, а здесь нужны абзацы, списки, таблицы
 * и жирный текст — ответ короткий.
 */
function AnswerMarkdown({ content }: { content: string }) {
  // mdToHtml понимает только маркеры в начале строки, а модели любят вложенные
  // списки с отступом и «•». Иначе вместо списка получался абзац с дефисами.
  const html = useMemo(
    () => mdToHtml(
      String(content || "")
        .replace(/\r\n?/g, "\n")
        .replace(/^[ \t]*[•·]\s+/gm, "- ")
        .replace(/^[ \t]+(-\s+|\d+\.\s+)/gm, "$1"),
    ),
    [content],
  );
  return (
    <div
      className="prose prose-sm min-w-0 max-w-none break-words dark:prose-invert [&_.lec-table-wrap]:my-2 [&_.lec-table-wrap]:w-full [&_.lec-table-wrap]:max-w-full [&_.lec-table-wrap]:overflow-x-auto [&_table]:my-2 [&_table]:w-max [&_table]:min-w-full [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ExplainWithAi({
  question,
  chosen,
  correct,
  subjectSlug,
  subjectName,
  review = false,
  clarify = false,
  options,
  className = "",
}: {
  /** Текст вопроса теста. */
  question: string;
  /** Что выбрал студент. */
  chosen?: string;
  /** Правильный ответ из ключа. */
  correct?: string;
  /** Слаг предмета: по нему тьютор берёт лекции. */
  subjectSlug?: string | null;
  subjectName?: string | null;
  /** В источнике нет ключа: разбираем вопрос по материалам курса, а не ошибку. */
  review?: boolean;
  /** Разрешить спросить ИИ до ответа: объяснит вопрос, не выдавая правильный вариант. */
  clarify?: boolean;
  /** Варианты ответа — чтобы ИИ объяснил, что значит каждый. */
  options?: string[];
  className?: string;
}) {
  /** Что видит студент: ответы ИИ и его уточняющие вопросы. */
  const [shown, setShown] = useState<Turn[]>([]);
  /** История для модели: включает исходный промпт с вопросом и ответами. */
  const historyRef = useRef<Turn[]>([]);
  const [images, setImages] = useState<AiAnswerImage[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState<AiProvider>("auto");

  useEffect(() => {
    let alive = true;
    void savedExplainProvider().then((p) => { if (alive) setProvider(p); });
    return () => { alive = false; };
  }, []);

  // Ссылка на картинку живёт в защищённом эндпоинте тренажёра: получаем её как
  // и весь остальной тренажёр, а не храним в ответе ИИ.
  useEffect(() => {
    if (!images.length) return;
    let alive = true;
    void Promise.all(images.map(async (image) => [image.card_id, await getTrainerImageUrl(image.card_id)] as const))
      .then((pairs) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        for (const [cardId, url] of pairs) if (url) next[cardId] = url;
        setImageUrls(next);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [images]);

  async function send(history: Turn[], visible: Turn[]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const response = await aiChat(history, provider, { mode: "precise", subjectSlug: subjectSlug || undefined });
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    historyRef.current = [...history, { role: "assistant", content: response.data.message.content }];
    setShown([...visible, { role: "assistant", content: response.data.message.content }]);
    setSources(response.data.sources ?? null);
    if (response.data.images?.length) setImages(response.data.images);
  }

  function explain() {
    const prompt = initialPrompt({ question, chosen, correct, subjectName, review, clarify, options });
    const history: Turn[] = [{ role: "user", content: prompt }];
    historyRef.current = history;
    setImages([]);
    setSources(null);
    void send(history, []);
  }

  function askFollowUp() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    const history: Turn[] = [...historyRef.current, { role: "user", content: text }];
    historyRef.current = history;
    void send(history, [...shown, { role: "user", content: text }]);
  }

  const answered = shown.length > 0;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={explain}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-50"
      >
        {busy && !answered ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {clarify ? "Не понял вопрос — спросить ИИ" : review ? "Разобрать · ИИ" : "Объяснить · ИИ"}
      </button>

      {error ? <p className="mt-2 text-xs text-[var(--status-critical-fg)]">{error}</p> : null}

      {answered ? (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm leading-relaxed">
          {shown.map((turn, index) => (
            turn.role === "user" ? (
              <p key={`u-${index}`} className="mt-3 border-t border-dashed border-[var(--border)] pt-2 text-xs font-semibold text-[var(--muted)]">
                Ваш вопрос: {turn.content}
              </p>
            ) : (
              <AnswerMarkdown
                key={`a-${index}`}
                content={index === 0 ? stripInlineSourceList(turn.content) : turn.content}
              />
            )
          ))}

          {images.length ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {images.map((image) => {
                const url = imageUrls[image.card_id];
                return (
                  <figure key={image.card_id} className="overflow-hidden rounded-xl border border-[var(--border)]">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={image.title} loading="lazy" decoding="async" className="max-h-56 w-full bg-slate-50 object-contain" />
                    ) : null}
                    <figcaption className="px-2 py-1 text-[11px] text-[var(--muted)]">
                      {image.kind === "electronogram" ? "Электронограмма" : "Микропрепарат"} · {image.title}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : null}

          <AnswerSources sources={sources} />

          {busy ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> ИИ отвечает…
            </p>
          ) : null}

          <form
            onSubmit={(event) => { event.preventDefault(); askFollowUp(); }}
            className="mt-2 flex items-center gap-1.5"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Спросить по разбору…"
              aria-label="Уточняющий вопрос по разбору"
              className="min-w-0 flex-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)]"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Спросить"
              className="rounded-full border border-[var(--primary)]/40 p-1.5 text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
