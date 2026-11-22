"use client";

/**
 * Рабочее пространство AI-тьютора: список чатов, переписка, выбор модели и
 * предмета. Один и тот же экран используется вкладкой «ИИ-тьютор» хаба
 * /tools — отдельной страницы /tutor больше нет, адрес редиректит сюда.
 *
 * Высота рассчитана на MobileNav: на телефоне и планшете внизу висит меню
 * (~4.5rem), без вычета поле ввода уезжало под него.
 */
import { Bot, ChevronLeft, Loader2 } from "lucide-react";

import { useTutorChat } from "@/components/tutor/useTutorChat";
import { TutorChatList } from "@/components/tutor/TutorChatList";
import { TutorComposer } from "@/components/tutor/TutorComposer";
import { TutorMessages } from "@/components/tutor/TutorMessages";
import { TutorModelPicker } from "@/components/tutor/TutorModelPicker";
import { PROVIDER_LABEL, PROVIDER_ORDER } from "@/components/tutor/model";

export function TutorWorkspace() {
  const chat = useTutorChat();

  if (chat.booting)
    return (
      <div className="flex h-[calc(100dvh-6rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );

  return (
    <div
      className="flex h-[calc(100dvh-14rem)] flex-col gap-3 lg:h-[calc(100dvh-11rem)]"
      style={chat.keyboardInset ? { height: `calc(100dvh - 14rem - ${chat.keyboardInset}px)` } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Bot className="h-6 w-6 text-[var(--primary)]" />
            AI-тьютор
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            История сохраняется и восстанавливается после перезагрузки страницы.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {PROVIDER_ORDER.filter((p) => p !== "auto" && p !== "custom").map((p) => {
            const m = chat.meta[p];
            const on = !!m?.available;
            return (
              <span
                key={p}
                title={m?.reason || undefined}
                className={
                  on
                    ? "rounded-full bg-[var(--status-ok-bg)] px-2.5 py-1 font-semibold text-[var(--status-ok-fg)]"
                    : "rounded-full bg-[var(--muted)]/20 px-2.5 py-1 text-[var(--muted)]"
                }
              >
                {PROVIDER_LABEL[p].split(" ")[0]} {on ? "●" : "○"}
              </span>
            );
          })}
        </div>
      </div>
      {/* grid-rows-[minmax(0,1fr)]: без явного трека auto-строка растёт по контенту
          (таблица ответа), и поле ввода уезжает за нижнюю границу карточки. */}
      {/* Двухколонка только с lg: на планшете (768–1023) список чатов
          раскрывается кнопкой, иначе переписке остаётся <450 px. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm lg:grid-cols-[280px_1fr]">
        <TutorChatList chat={chat} />
        <section className={"min-h-0 min-w-0 " + (chat.mobileList ? "hidden lg:flex" : "flex")}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
              <button
                type="button"
                onClick={() => chat.setMobileList(true)}
                className="rounded-lg p-2 hover:bg-[var(--background)] lg:hidden"
                aria-label="К списку чатов"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <TutorModelPicker chat={chat} />

              <div
                className="flex items-center gap-1 rounded-xl border border-[var(--border)] p-0.5 text-xs"
                role="group"
                aria-label="Режим ответа"
              >
                {(
                  [
                    ["precise", "Точный"],
                    ["fast", "Быстрый"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chat.setMode(value)}
                    aria-pressed={chat.mode === value}
                    title={
                      value === "precise"
                        ? "Ответ по лекциям предмета и материалам ЦНС, со сносками [N]"
                        : "Быстрее, без поиска по лекциям"
                    }
                    className={
                      "rounded-lg px-2.5 py-1.5 font-semibold transition " +
                      (chat.mode === value ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:text-[var(--primary)]")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!chat.anyPlatformAvailable && (
                <span className="text-xs text-[var(--muted)]">
                  Доступен только режим «Авто»: остальные модели не настроены на сервере.
                </span>
              )}
              <select
                value={chat.subjectSlug}
                onChange={(e) => chat.setSubjectSlug(e.target.value)}
                className="min-w-[170px] rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                aria-label="Предмет"
              >
                <option value="">Все предметы</option>
                {chat.subjects.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="ml-auto truncate text-xs text-[var(--muted)]">{chat.conversation?.title}</span>
            </div>
            <TutorMessages chat={chat} />
            <TutorComposer chat={chat} />
          </div>
        </section>
      </div>
    </div>
  );
}
