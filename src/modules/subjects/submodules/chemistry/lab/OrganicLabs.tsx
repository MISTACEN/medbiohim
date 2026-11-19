"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Droplets, FlaskConical, TriangleAlert } from "lucide-react";

import { ChemRichText } from "../ChemRichText";
import { ORGANIC_LAB_SECTIONS } from "@/lib/chemistry/organicLabs";

/**
 * Опыты из методички по органике (МБХ-201): уравнения, объяснение, наблюдения
 * и ответы на вопросы — всё на сайте, без PDF.
 */
export function OrganicLabs() {
  const [activeId, setActiveId] = useState(ORGANIC_LAB_SECTIONS[0].labs[0].id);

  const active = useMemo(() => {
    for (const section of ORGANIC_LAB_SECTIONS) {
      const lab = section.labs.find((item) => item.id === activeId);
      if (lab) return { section, lab };
    }
    return { section: ORGANIC_LAB_SECTIONS[0], lab: ORGANIC_LAB_SECTIONS[0].labs[0] };
  }, [activeId]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {ORGANIC_LAB_SECTIONS.map((section) => (
          <div key={section.id}>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              {section.title}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {section.labs.map((lab) => (
                <button
                  key={lab.id}
                  type="button"
                  onClick={() => setActiveId(lab.id)}
                  aria-pressed={lab.id === activeId}
                  className={
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                    (lab.id === activeId
                      ? "bg-indigo-600 text-white"
                      : "border border-[var(--border)] text-slate-600 hover:border-indigo-300")
                  }
                >
                  {lab.id} · {lab.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <article className="space-y-4 rounded-xl border border-[var(--border)] p-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Опыт {active.lab.id} · {active.section.title}
          </p>
          <h3 className="mt-1 text-lg font-bold">{active.lab.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{active.lab.goal}</p>
        </header>

        <section>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <FlaskConical className="h-4 w-4 text-indigo-500" /> Уравнения реакций
          </h4>
          <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-3 font-mono text-sm dark:bg-slate-900/40">
            {active.lab.reactions.map((reaction) => (
              <ChemRichText key={reaction} text={reaction} asHtml={false} />
            ))}
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold">Почему так происходит</h4>
          <p className="mt-1 text-sm leading-relaxed">{active.lab.explanation}</p>
        </section>

        {active.lab.observation ? (
          <section>
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Droplets className="h-4 w-4 text-sky-500" /> Что видно
            </h4>
            <p className="mt-1 text-sm leading-relaxed">{active.lab.observation}</p>
          </section>
        ) : null}

        {active.lab.safety ? (
          <p className="flex gap-2 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-xs text-[var(--status-warn-fg)]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{active.lab.safety}</span>
          </p>
        ) : null}

        <section>
          <h4 className="text-sm font-semibold">
            Вопросы к опыту ({active.lab.questions.length})
          </h4>
          <div className="mt-2 space-y-2">
            {active.lab.questions.map((item) => (
              <details key={item.question} className="group rounded-xl border border-[var(--border)] p-3">
                <summary className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 transition group-open:rotate-180" />
                  <span>{item.question}</span>
                </summary>
                <p className="mt-2 pl-6 text-sm leading-relaxed text-[var(--muted)]">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </article>

      <p className="text-xs text-[var(--muted)]">
        Ответы даны по методичке кафедры; уравнения записаны в молекулярном виде, структурные
        формулы комплексных соединений намеренно упрощены.
      </p>
    </div>
  );
}

export default OrganicLabs;
