/**
 * Сборка задания диагностикума по режимам: части вопроса и ключ ответа.
 *
 * Вынесено из `model.ts`, чтобы тот оставался в бюджете маршрутного файла и
 * отвечал только за выбор карточки банка. Примитивы (строки, списки,
 * перемешивание) — в `model-base.ts`; обратной зависимости от `model.ts` нет,
 * кроме типа режима.
 *
 * Варианты закрываются `sealOptions`: id — позиция после перемешивания, а не
 * ключ методички и не префикс правильности. Иначе правильный ответ читался по
 * разметке (см. `sealOptions` в `model-base.ts`).
 */
import { guideStructures, sample, sealOptions, stringList } from "./model-base";
import type { DiagnosticumMode } from "./model";
import type { AnswerKey, GuideRow, Question, QuestionPart } from "./types";

/** Разбор препарата словами: признаки, отличия, иначе само название. */
function exploration(guide: GuideRow): string {
  const features = stringList(guide.features);
  const differential = stringList(guide.differential);
  return [features.join("; "), differential.join("; ")].filter(Boolean).join(". ") || guide.name;
}

/** Готовая часть задания вместе с id правильных вариантов — ключ остаётся на сервере. */
type BuiltPart = { part: QuestionPart; correct: string[] };

/**
 * Собирает вопрос и ключ ответа для выбранного режима. Общие рамки задания
 * (карточка с картинкой, пул обманок, подписи структур) уже посчитаны в
 * `buildQuestion`; здесь — только оси режима.
 */
export function buildModeQuestion(input: {
  guide: GuideRow;
  mode: DiagnosticumMode;
  others: GuideRow[];
  sameSection: GuideRow[];
  distractorPool: GuideRow[];
  title: (slug: string) => string;
  random: () => number;
  base: { image_card_id: string };
}): { question: Question; answers: AnswerKey } | null {
  const { base, distractorPool, guide, mode, others, random, sameSection, title } = input;

  const namePart = (count: number): BuiltPart => {
    // Обманки без повторов и без самого препарата: иначе в задании оказывались
    // два одинаковых варианта и число вариантов «плавало» (4 или 5).
    const seen = new Set<string>([guide.name.trim()]);
    const candidates = distractorPool.filter((item) => {
      const name = String(item.name || "").trim();
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    const distractors = sample(candidates, count, random).map((item) => String(item.name));
    const sealed = sealOptions(
      [{ label: guide.name, correct: true }, ...distractors.map((label) => ({ label, correct: false }))],
      random,
    );
    return {
      part: {
        id: "preparation",
        kind: "single",
        title: "Что это за препарат?",
        options: sealed.options,
      },
      correct: sealed.correct,
    };
  };

  const structures = guideStructures(guide);
  const structuresPart = (): BuiltPart | null => {
    if (!structures.length) return null;
    const foreign = new Set<string>();
    for (const item of others) {
      for (const slug of guideStructures(item)) {
        if (!structures.includes(slug)) foreign.add(slug);
      }
    }
    const distractors = sample(Array.from(foreign), 3, random);
    const sealed = sealOptions(
      [
        ...structures.map((slug) => ({ label: title(slug), correct: true })),
        ...distractors.map((slug) => ({ label: title(slug), correct: false })),
      ],
      random,
    );
    return {
      part: {
        id: "structures",
        kind: "multi",
        title: "Отметь диагностические структуры этого препарата",
        options: sealed.options,
      },
      correct: sealed.correct,
    };
  };

  // Раньше обманкой могло стать любое чужое «утверждение», включая обрубки вроде
  // «Хвост» или «Ядро»: они выдавали себя формой, а не содержанием. Берём только
  // связные формулировки и сначала из того же раздела — там ошибка правдоподобнее.
  const informativeFact = (fact: string) =>
    fact.trim().split(/\s+/).filter(Boolean).length >= 3 && fact.trim().length >= 18;
  const statementOptions = (facts: string[], groups: GuideRow[][]): string[] => {
    const pool = new Set<string>();
    for (const group of groups) {
      for (const item of group) {
        for (const fact of stringList(item.features)) {
          if (!informativeFact(fact) || facts.includes(fact)) continue;
          pool.add(fact);
        }
      }
    }
    return sample(Array.from(pool), 2, random);
  };

  const statementsPart = (): (BuiltPart & { explanation: string }) | null => {
    const facts = stringList(guide.features).slice(0, 3);
    if (facts.length < 2) return null;
    const fakes = statementOptions(facts, [sameSection, others]);
    if (!fakes.length) return null;
    const sealed = sealOptions(
      [
        ...facts.map((label) => ({ label, correct: true })),
        ...fakes.map((label) => ({ label, correct: false })),
      ],
      random,
    );
    return {
      part: {
        id: "statements",
        kind: "multi",
        title: "Отметь утверждения, которые относятся к этому препарату",
        options: sealed.options,
      },
      correct: sealed.correct,
      explanation: stringList(guide.mistakes).slice(0, 2).join("; ") || exploration(guide),
    };
  };

  if (mode === "complex") {
    // Все оси, которые есть у препарата, — в одном задании. Части добавляются
    // только если для них есть данные, чтобы не показывать пустые блоки.
    const name = namePart(3);
    const parts: QuestionPart[] = [name.part];
    const answers: AnswerKey["parts"] = {
      preparation: { correct: name.correct, explanation: exploration(guide) },
    };

    const structuresOnly = structuresPart();
    if (structuresOnly) {
      parts.push(structuresOnly.part);
      answers.structures = {
        correct: structuresOnly.correct,
        explanation: stringList(guide.features).join("; ") || exploration(guide),
      };
    }

    const statements = statementsPart();
    if (statements) {
      parts.push(statements.part);
      answers.statements = { correct: statements.correct, explanation: statements.explanation };
    }

    return {
      question: {
        ...base,
        prompt: "Разбор препарата: определи его, отметь структуры и сверь утверждения.",
        parts,
      },
      answers: { parts: answers },
    };
  }

  // Экзамен — тот же вопрос «определи препарат», но без подсказок и без разбора
  // до завершения: сервер отдаёт только балл, эталон остаётся в строке попытки.
  if (mode === "exam") {
    const name = namePart(4);
    return {
      question: {
        ...base,
        prompt: "Экзамен: определи препарат по изображению.",
        parts: [name.part],
      },
      answers: {
        parts: {
          preparation: { correct: name.correct, explanation: exploration(guide) },
        },
      },
    };
  }

  if (mode === "identify") {
    const name = namePart(3);
    return {
      question: {
        ...base,
        prompt: "Определи препарат по изображению.",
        parts: [name.part],
      },
      answers: {
        parts: {
          preparation: { correct: name.correct, explanation: exploration(guide) },
        },
      },
    };
  }

  if (mode === "structures") {
    const part = structuresPart();
    if (!part) return null;
    return {
      question: {
        ...base,
        prompt: "Рассмотри препарат и отметь структуры, которые действительно видны.",
        parts: [part.part],
      },
      answers: {
        parts: {
          structures: {
            correct: part.correct,
            explanation: stringList(guide.features).join("; ") || exploration(guide),
          },
        },
      },
    };
  }

  if (mode === "schema") {
    // Ось 1 — сверка утверждений с источником (features гида против чужих),
    // ось 2 — вывод препарата по выбранным признакам.
    const statements = statementsPart();
    if (!statements) return null;
    const name = namePart(3);
    return {
      question: {
        ...base,
        prompt: "Схема препарата: сверь утверждения с источником, затем определи препарат.",
        parts: [statements.part, name.part],
      },
      answers: {
        parts: {
          statements: { correct: statements.correct, explanation: statements.explanation },
          preparation: { correct: name.correct, explanation: exploration(guide) },
        },
      },
    };
  }

  if (mode === "differential") {
    const shared = others.find((item) =>
      guideStructures(item).some((slug) => structures.includes(slug)),
    );
    const lookAlike = shared ?? sample(sameSection.length ? sameSection : others, 1, random)[0] ?? null;
    if (!lookAlike) return null;
    const sealed = sealOptions(
      [
        { label: guide.name, correct: true },
        { label: lookAlike.name, correct: false },
      ],
      random,
    );
    return {
      question: {
        ...base,
        prompt: `Похожие препараты легко перепутать. Что изображено: «${guide.name}» или «${lookAlike.name}»?`,
        parts: [
          {
            id: "preparation",
            kind: "single",
            title: "Выбери правильный вариант",
            options: sealed.options,
          },
        ],
      },
      answers: {
        parts: {
          preparation: {
            correct: sealed.correct,
            explanation:
              (stringList(guide.differential).join("; ") ||
                `Отличие от «${lookAlike.name}» — в строении и составе структур.`) +
              (structures.length ? ` Ключевые структуры: ${structures.map(title).join(", ")}.` : ""),
          },
        },
      },
    };
  }

  return null;
}
