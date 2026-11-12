"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ClipboardCheck, ExternalLink, FileDown, FlaskConical, Printer, X } from "lucide-react";
import { ChemistryModule } from "@/modules/subjects/submodules/chemistry";
import type { Lecture } from "@/lib/api";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { LectureLearningLinks } from "@/components/lectures/LectureLearningLinks";
import { LectureBlocksNav } from "@/components/lectures/LectureBlocksNav";
import { downloadLectureWord, printLecturePdf } from "@/lib/lectures/exportLecture";
import { useLectureProgress } from "@/hooks/useLectureProgress";
import { lectureSolvedCount, lectureTaskTotal, splitLectureBlocks } from "@/lib/lectureProgress";
import { resolveLectureSubjectKey, submoduleOf } from "@/lib/lectures/submodules";
import { readChemPanelOpen, writeChemPanelOpen } from "@/lib/lectures/chemPanelState";
import { resetPrintScope } from "@/lib/chemistry/export";
import { lectureChemContext } from "@/lib/chemistry/lectureContext";

/**
 * Оформление лекции в одном месте: отдельная страница /lectures/:id и чтение
 * лекции прямо внутри предмета (вкладка «Лекции») показывают один и тот же
 * блок: оглавление по блокам, шапку с названием, скачиванием и прогрессом,
 * текст, навигацию «предыдущий/следующий блок» и привязанные материалы.
 */
export type LectureViewProps = {
  lecture: Lecture;
  /** id лекции — ключ для локального прогресса мини-тестов. */
  lectureId?: string;
  /** Куда ведёт ссылка «назад» на отдельной странице лекции. */
  backHref?: string;
  backLabel?: string;
  /** Номер занятия плана: по нему строится ссылка «Лекция + тест по теме». */
  lessonNumber?: number | null;
  /** В предмете лекция закрывается без перехода — кнопка вместо ссылки. */
  onBack?: () => void;
  className?: string;
};

export function LectureView({
  lecture,
  lectureId,
  backHref = "/lectures",
  backLabel = "К списку",
  onBack,
  className,
  lessonNumber,
}: LectureViewProps) {
  const progress = useLectureProgress();
  const contentRef = useRef<HTMLDivElement>(null);
  const id = lectureId || String((lecture as any)?.id || "");

  // Рядом с лекцией должен быть тест той же темы, а не список из двадцати
  // тестов предмета: ссылка ведёт на объединённую страницу занятия.
  // Номер занятия приходит из плана страницы темы; поле topic лекции — запасной
  // вариант для отдельной страницы /lectures/:id, где плана рядом нет.
  const lessonNum =
    Number.isFinite(lessonNumber) && Number(lessonNumber) > 0
      ? String(Number(lessonNumber))
      : /занят[а-яё]*\s+(\d{1,2})/i.exec(String((lecture as any)?.topic || ""))?.[1];
  const subjectSlug = String((lecture as any)?.subject_slug || "");
  const topicHref =
    lessonNum && subjectSlug ? `/subjects/${encodeURIComponent(subjectSlug)}/lesson/${lessonNum}` : null;

  // Внутри лекции меняются только блоки-подтемы: оглавление и рендер берут
  // один и тот же разбор markdown по H2/H3.
  const blocks = useMemo(() => splitLectureBlocks((lecture as any)?.body_markdown), [lecture]);
  // Панель открывается на том разделе, который нужен этой лекции: уравнения из
  // текста → «Реакции», только формулы → «Структуры» с первым веществом.
  const chemContext = useMemo(
    () => lectureChemContext(String((lecture as any)?.body_markdown || (lecture as any)?.body_md || "")),
    [lecture],
  );
  const [activeBlock, setActiveBlock] = useState(0);
  // На телефоне читать по одному блоку неудобно: по умолчанию показываем
  // всю лекцию подряд, а переключатель оставляет режим «по блокам».
  const [readAll, setReadAll] = useState(false);
  // Химический модуль живёт в правой выдвижной панели: он тяжёлый, поэтому
  // монтируется только когда панель открыта, и не мешает чтению лекции.
  //
  // Состояний два: chemMounted — панель есть в DOM, chemVisible — она доехала
  // до конечной позиции. Иначе анимация закрытия невозможна: portal исчезал бы
  // мгновенно вместе с флагом «открыто».
  const [chemMounted, setChemMounted] = useState(false);
  const [chemVisible, setChemVisible] = useState(false);
  const chemPanelRef = useRef<HTMLElement | null>(null);
  const chemButtonRef = useRef<HTMLButtonElement | null>(null);
  const chemCloseTimer = useRef<number | null>(null);
  // Намерение «панель должна быть видна»: отложенный показ не должен сработать,
  // если панель уже закрыли.
  const chemIntent = useRef(false);

  const showChem = useCallback(() => {
    chemIntent.current = true;
    const apply = () => {
      if (chemIntent.current) setChemVisible(true);
    };
    // Двойной кадр: элемент должен сначала отрисоваться за краем экрана,
    // иначе браузер не проиграет transition и панель появится рывком.
    requestAnimationFrame(() => requestAnimationFrame(apply));
    // Страховка для фоновой вкладки и старых движков: rAF там не вызывается,
    // и без таймера панель осталась бы смонтированной за правым краем.
    window.setTimeout(apply, 120);
  }, []);

  const openChem = useCallback(() => {
    writeChemPanelOpen(true);
    if (chemCloseTimer.current !== null) {
      window.clearTimeout(chemCloseTimer.current);
      chemCloseTimer.current = null;
    }
    setChemMounted(true);
    showChem();
  }, [showChem]);

  const closeChem = useCallback(() => {
    writeChemPanelOpen(false);
    // Ограничение печати живёт на <html>: если панель закрыли прямо во время
    // печати, его надо снять, иначе следующая печать будет пустой.
    resetPrintScope();
    chemIntent.current = false;
    setChemVisible(false);
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (chemCloseTimer.current !== null) window.clearTimeout(chemCloseTimer.current);
    chemCloseTimer.current = window.setTimeout(() => {
      setChemMounted(false);
      chemCloseTimer.current = null;
    }, reduced ? 0 : 320);
    chemButtonRef.current?.focus();
  }, []);

  // Открыли панель на одной лекции — она же ждёт нас на следующей.
  useEffect(() => {
    if (!readChemPanelOpen()) return;
    setChemMounted(true);
    showChem();
  }, [showChem]);

  useEffect(() => () => {
    if (chemCloseTimer.current !== null) window.clearTimeout(chemCloseTimer.current);
  }, []);

  // Escape закрывает панель, фон не прокручивается под ней, фокус уходит в панель.
  useEffect(() => {
    if (!chemMounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChem();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    chemPanelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [chemMounted, closeChem]);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches) {
      setReadAll(true);
    }
  }, []);

  useEffect(() => {
    setActiveBlock(0);
  }, [id]);

  // На телефоне оглавление — раскрывающаяся панель прямо над текстом: если
  // скроллить сразу, её схлопывание сдвигает текст и экран «прыгает». Поэтому
  // ждём кадр после перерисовки и ведём плавно к заголовку выбранного блока,
  // а не к началу карточки лекции.
  const scrollToBlock = (next: number) => {
    const hasMatchMedia = typeof window.matchMedia === "function";
    const reduced = hasMatchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
    if (hasMatchMedia && window.matchMedia("(max-width: 640px)").matches) {
      const title = blocks[next]?.title;
      const nodes = contentRef.current?.querySelectorAll<HTMLElement>("[data-lec-title]") ?? [];
      const node = title ? Array.from(nodes).find((el) => el.dataset.lecTitle === title) : null;
      const target = node ?? contentRef.current;
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: Math.max(0, top), behavior });
      return;
    }
    contentRef.current?.scrollIntoView({ behavior, block: "start" });
  };

  const changeBlock = (next: number) => {
    setActiveBlock(next);
    // Двойной кадр: сначала перерисовка (сменился блок, закрылось оглавление),
    // потом скролл — иначе координаты считаются по старой раскладке.
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToBlock(next)));
  };

  const total = lectureTaskTotal((lecture as any)?.body_markdown);
  const solved = lectureSolvedCount(id, total, progress);
  const percent = total > 0 ? Math.round((solved / total) * 100) : 0;

  const media = Array.isArray(lecture.media) ? lecture.media : [];
  const moduleTitle = lecture.subject || lecture.subject_slug;
  // Подпись подмодуля программы — чтобы было видно место лекции в курсе.
  const submodule = submoduleOf(resolveLectureSubjectKey(lecture as any), String((lecture as any)?.id || id));
  const safeIndex = Math.min(Math.max(activeBlock, 0), Math.max(0, blocks.length - 1));
  const single = blocks.length > 1 && !readAll ? safeIndex : undefined;
  const backClassName =
    "inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]";

  return (
    <div className={className || "space-y-4"}>
      {onBack ? (
        <button type="button" onClick={onBack} className={backClassName}>
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </button>
      ) : (
        <Link href={backHref} className={backClassName}>
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
      )}

      <section className="card overflow-hidden p-0">
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          {blocks.length > 0 && (
            <LectureBlocksNav
              blocks={blocks}
              activeIndex={safeIndex}
              onSelect={changeBlock}
              lectureId={String((lecture as any).id || id)}
              lessonTitle={lecture.title}
              moduleTitle={moduleTitle}
            />
          )}

          <div ref={contentRef} className="min-w-0 scroll-mt-24">
            <header className="border-b border-[var(--border)] px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
                    {moduleTitle || "Лекция"}
                    {submodule ? <span className="text-[var(--muted)]"> · {submodule.title}</span> : null}
                  </div>
                  <h1 className="page-title mt-1 break-words">{lecture.title}</h1>
                  {lecture.published_at && (
                    <p className="page-subtitle">
                      Опубликовано: {new Date(lecture.published_at).toLocaleString("ru-RU")}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => downloadLectureWord(lecture as any)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <FileDown className="h-3.5 w-3.5" /> Скачать Word
                    </button>
                    <button
                      type="button"
                      onClick={() => printLecturePdf(lecture as any)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <Printer className="h-3.5 w-3.5" /> Скачать PDF
                    </button>
                    {topicHref && (
                      <Link
                        href={topicHref}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" /> Лекция + тест по теме
                      </Link>
                    )}
                    <button
                      type="button"
                      ref={chemButtonRef}
                      onClick={openChem}
                      aria-haspopup="dialog"
                      aria-expanded={chemMounted}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <FlaskConical className="h-3.5 w-3.5 text-[var(--status-ok-fg)]" /> Химический модуль
                    </button>
                  </div>
                </div>
                {total > 0 && (
                  <div className="w-full sm:max-w-[200px]">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>Задачи</span>
                      <span>
                        {solved} / {total}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Решено задач: {solved} из {total}
                    </p>
                  </div>
                )}
              </div>
            </header>

            <article className="px-4 py-4 sm:px-6 sm:py-5">
              <LectureRenderer
                markdown={lecture.body_markdown || lecture.body_md || ""}
                html={lecture.body_html || ""}
                lectureId={String((lecture as any).id || id)}
                activeBlock={single}
              />
            </article>

            <div className="space-y-4 px-4 pb-5 sm:px-6">
              {blocks.length > 1 && (
                <nav className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                  <button
                    type="button"
                    disabled={safeIndex === 0}
                    onClick={() => changeBlock(safeIndex - 1)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold disabled:opacity-40 sm:flex-none"
                  >
                    <ArrowLeft className="h-4 w-4" /> Предыдущий блок
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      Блок {safeIndex + 1} из {blocks.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReadAll((v) => !v)}
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:border-indigo-300 hover:text-indigo-600"
                    >
                      {readAll ? "По блокам" : "Читать целиком"}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={safeIndex >= blocks.length - 1}
                    onClick={() => changeBlock(safeIndex + 1)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none"
                  >
                    Следующий блок <ArrowRight className="h-4 w-4" />
                  </button>
                </nav>
              )}

              <LectureLearningLinks relatedLearning={lecture.related_learning} />

              {media.length > 0 && (
                <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
                    Поиск видео и схем
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    RuTube, VK, Яндекс — без VPN; YouTube — при доступе.
                  </p>
                  <ul className="space-y-2">
                    {[...media]
                      .sort(
                        (a, b) =>
                          (String(a.region) === "ru" ? 0 : 1) -
                          (String(b.region) === "ru" ? 0 : 1)
                      )
                      .map((m, i) => {
                        const title = String(m.title || m.type || `Ссылка ${i + 1}`);
                        const url = String(m.url || "");
                        const isRu = String(m.region || "") === "ru";
                        return (
                          <li key={i} className="rounded-xl border border-[var(--border)] p-3">
                            <span
                              className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isRu ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-slate-100 text-slate-600"}`}
                            >
                              {isRu ? "без VPN" : "VPN?"}
                            </span>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
                              >
                                {title} <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              title
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Панель рендерим в portal: внутри карточки лекции fixed иногда считает
          containing block родителя, и панель съезжает с края экрана. */}
      {chemMounted &&
        typeof document !== "undefined" &&
        createPortal(
        <div
          data-chem-print-root=""
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Химический модуль"
        >
          {/* Клик по фону закрывает панель — на телефоне это основной способ вернуться к лекции. */}
          <div
            aria-hidden="true"
            onClick={closeChem}
            className={
              "chem-panel-backdrop absolute inset-0 cursor-default bg-slate-900/40 transition-opacity duration-200 motion-reduce:transition-none " +
              (chemVisible ? "opacity-100" : "opacity-0")
            }
          />
          <aside
            ref={chemPanelRef}
            tabIndex={-1}
            // Фон именно --background, а не --card: в части тем --card полупрозрачный
            // (rgba 0.74–0.9), и сквозь панель читалась лекция под оверлеем.
            className={
              "chem-panel relative flex h-full w-full flex-col bg-[var(--background)] shadow-2xl outline-none transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none sm:w-[440px] sm:max-w-[92vw] lg:w-[560px] " +
              (chemVisible ? "translate-x-0" : "translate-x-full")
            }
          >
            {/* Внутри узкой панели многоколоночные сетки инструментов не помещаются:
                брейкпоинты Tailwind считаются по ширине окна, а не панели, поэтому
                sm/md/lg/xl-сетки и базовые grid-cols-N сводим в одну колонку.
                Сетка периодической таблицы задана инлайн-стилем и не задета — ей
                нужна своя горизонтальная прокрутка. */}
            <style>{`.chem-panel [class*="grid-cols-"] { grid-template-columns: minmax(0, 1fr) !important; }
.chem-panel [role="tab"][id^="chem-tab-"] { padding: 0.35rem 0.6rem; font-size: 0.75rem; }`}</style>
            <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
                <FlaskConical className="h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" /> Химический модуль
              </span>
              <button
                type="button"
                onClick={closeChem}
                aria-label="Закрыть химический модуль"
                className="rounded-lg border border-[var(--border)] p-2 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="chem-panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <ChemistryModule
                initialSection={chemContext.section ?? undefined}
                initialEquation={chemContext.equation ?? undefined}
                initialSubstances={chemContext.substances}
              />
            </div>
            <footer className="chem-panel-chrome border-t border-[var(--border)] px-4 py-3">
              <Link href="/chemistry" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">
                Открыть отдельной страницей <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </footer>
          </aside>
        </div>,
          document.body
        )}
    </div>
  );
}
