/** Инварианты контента «Подготовка к самостоятельной + Режим экзамена» (T1).
 *
 *  Цель — ловить регрессии контента, которые «тихо» ломают проверку:
 *   - эталон не закрывает сам себя (вопрос/задание/электронограмма не проверяемы);
 *   - мёртвый anyOf-вариант: строка, которую не может распознать матчер
 *     (например, слишком короткая или не проходящая нормализацию);
 *   - недостижимая оценка «5»: нет detailKeyPoints/detailModel у task3;
 *   - варианты ответов в открытых вопросах (задание требует ТОЛЬКО открытые).
 *
 *  Тест не правит контент (src/lib/histology/* вне write scope): при падении
 *  в сообщении перечисляются конкретные id, которые надо передать автору контента.
 */

import { describe, expect, it } from "vitest";
import { EMBRYOLOGY_SELF_WORK } from "../histology/embryologySelfWork";
import { checkSelfWorkAnswer, checkSelfWorkLabels, matchesSelfWorkKeyPoint } from "../histology/openAnswerCheck";
import { selfWorkTopicForLecture } from "../histology/selfWorkTopics";
import type { SelfWorkCheckResult, SelfWorkKeyPoint, SelfWorkTopic } from "../histology/selfWorkTypes";

const LECTURE_ID = "hist-03-embriologiya";
const topic = selfWorkTopicForLecture(LECTURE_ID);

function requireTopic(): SelfWorkTopic {
  if (!topic) throw new Error(`Тема ${LECTURE_ID} не найдена в реестре selfWorkTopics`);
  return topic;
}

/** Все проверяемые пункты контента с адресом — чтобы падение называло точный id. */
type LocatedPoint = { where: string; point: SelfWorkKeyPoint };

function locatedKeyPoints(t: SelfWorkTopic): LocatedPoint[] {
  const out: LocatedPoint[] = [];
  for (const question of t.openQuestions) {
    for (const point of question.keyPoints ?? []) {
      out.push({ where: `openQuestions/${question.id}/${point.id}`, point });
    }
  }
  for (const variant of t.exam.variants ?? []) {
    for (const point of variant.task1?.keyPoints ?? []) {
      out.push({ where: `exam/${variant.id}/task1/${point.id}`, point });
    }
    for (const point of variant.task3?.keyPoints ?? []) {
      out.push({ where: `exam/${variant.id}/task3/${point.id}`, point });
    }
    for (const point of variant.task3?.detailKeyPoints ?? []) {
      out.push({ where: `exam/${variant.id}/task3/detail/${point.id}`, point });
    }
  }
  for (const electronogram of t.exam.electronograms ?? []) {
    for (const label of electronogram.labels ?? []) {
      out.push({
        where: `exam/${electronogram.id}/label-${label.n}`,
        point: { id: `label-${label.n}`, label: label.label, anyOf: label.anyOf ?? [] },
      });
    }
  }
  return out;
}

/** Проверка ответа по пунктам с человекочитаемым списком потерь для сообщения. */
function expectComplete(result: SelfWorkCheckResult, where: string): void {
  const lost = result.misses.map((point) => `${point.id} (эталон: ${point.anyOf?.[0] ?? point.label})`);
  expect(
    result.complete,
    `${where}: модель не закрывает ${lost.length} пункт(ов): ${lost.join("; ")}`,
  ).toBe(true);
}

/** Те же слова-инструкции, что и в ExamModePanel (T2): шаг памятки не должен
 *  требовать от студента служебных слов. Дублируется намеренно — тест проверяет
 *  именно то, как UI собирает пункты проверки памятки. */
const MEMO_STOP_WORDS = new Set([
  "описать", "опишите", "назвать", "назовите", "указать", "укажите",
  "перечислить", "перечислите", "отметить", "отметьте", "рассказать", "расскажите",
  "например", "который", "которая", "которые", "также", "нужно", "надо",
  "может", "будет", "будут", "этот", "эта", "эти", "того", "чтобы",
  "если", "или", "для", "при", "чем", "как", "так", "что",
]);

function significantWords(text: string): string[] {
  return Array.from(
    new Set(
      String(text ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
        .split(/\s+/)
        .map((word) => word.replace(/^-+|-+$/g, ""))
        .filter((word) => word.length >= 4 && !MEMO_STOP_WORDS.has(word)),
    ),
  );
}

function memoStepKeyPoints(t: SelfWorkTopic): SelfWorkKeyPoint[] {
  return (t.exam.memo?.steps ?? []).map((step, index) => {
    const words = significantWords(`${step.title} ${step.hint}`);
    return {
      id: `memo-step-${index + 1}`,
      label: step.title || `Шаг ${index + 1}`,
      anyOf: words.length ? words : [step.title || `Шаг ${index + 1}`],
    };
  });
}

/* ── тема и реестр ───────────────────────────────────────────────────────── */

describe("контент: тема и реестр", () => {
  it("тема hist-03-embriologiya зарегистрирована и совпадает с экспортом", () => {
    const t = requireTopic();
    expect(t.lectureId).toBe(LECTURE_ID);
    expect(t.title.trim().length).toBeGreaterThan(0);
    expect(EMBRYOLOGY_SELF_WORK.lectureId).toBe(LECTURE_ID);
    expect(t.exam).toBeTruthy();
    expect(t.exam.title.trim().length).toBeGreaterThan(0);
    expect(t.exam.intro.trim().length).toBeGreaterThan(0);
  });

  it("открытых вопросов >= 24, id уникальны, prompt заполнен", () => {
    const t = requireTopic();
    expect(t.openQuestions.length).toBeGreaterThanOrEqual(24);

    const violations: string[] = [];
    const seen = new Set<string>();
    for (const question of t.openQuestions) {
      if (!question.id.trim()) violations.push("вопрос с пустым id");
      if (seen.has(question.id)) violations.push(`дубль id вопроса: ${question.id}`);
      seen.add(question.id);
      if (!question.prompt.trim()) violations.push(`${question.id}: пустой prompt`);
      if (!question.topic.trim()) violations.push(`${question.id}: пустая подтема (topic)`);
      if (!question.model.trim()) violations.push(`${question.id}: пустой образцовый ответ (model)`);
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("у каждого вопроса непустые keyPoints и anyOf, без пустых строк и дублей id", () => {
    const t = requireTopic();
    const violations: string[] = [];
    for (const question of t.openQuestions) {
      if (!question.keyPoints.length) violations.push(`${question.id}: пустой keyPoints`);
      if (question.keyPoints.length < 3) violations.push(`${question.id}: меньше 3 пунктов (${question.keyPoints.length})`);
      const ids = new Set<string>();
      for (const point of question.keyPoints) {
        if (!point.id.trim()) violations.push(`${question.id}: пункт с пустым id`);
        if (ids.has(point.id)) violations.push(`${question.id}: дубль id пункта ${point.id}`);
        ids.add(point.id);
        if (!point.label.trim()) violations.push(`${question.id}/${point.id}: пустой label`);
        if (!point.anyOf.length) violations.push(`${question.id}/${point.id}: пустой anyOf`);
        for (const variant of point.anyOf) {
          if (!String(variant).trim()) violations.push(`${question.id}/${point.id}: пустой вариант в anyOf`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("в prompt нет перечислений вариантов ответа «а) б) в)»", () => {
    const t = requireTopic();
    const prompts: Array<[string, string]> = [];
    for (const question of t.openQuestions) prompts.push([`openQuestions/${question.id}`, question.prompt]);
    for (const variant of t.exam.variants) {
      prompts.push([`exam/${variant.id}/task1`, variant.task1.prompt]);
      prompts.push([`exam/${variant.id}/task3`, variant.task3.prompt]);
    }
    for (const electronogram of t.exam.electronograms) {
      prompts.push([`exam/${electronogram.id}`, electronogram.prompt]);
    }
    const enumerations = prompts.filter(([, prompt]) => /(?:^|[\s(])[а-я]\)/i.test(prompt));
    expect(
      enumerations.map(([where]) => where),
      `в вопросах появились варианты ответа: ${enumerations.map(([where, prompt]) => `${where}: ${prompt.slice(0, 80)}`).join(" | ")}`,
    ).toEqual([]);
  });
});

/* ── проверяемость контента ──────────────────────────────────────────────── */

describe("контент: образцовые ответы закрывают эталон", () => {
  it("checkSelfWorkAnswer(model, keyPoints).complete === true для каждого вопроса", () => {
    const t = requireTopic();
    for (const question of t.openQuestions) {
      expectComplete(checkSelfWorkAnswer(question.model, question.keyPoints), `openQuestions/${question.id}`);
    }
  });

  it("для каждого варианта task1 и task3 модель закрывает все пункты", () => {
    const t = requireTopic();
    expect(t.exam.variants).toHaveLength(4);
    const seen = new Set<string>();
    for (const variant of t.exam.variants) {
      expect(seen.has(variant.id), `дубль id варианта: ${variant.id}`).toBe(false);
      seen.add(variant.id);
      expect(variant.title.trim().length, `${variant.id}: пустой title`).toBeGreaterThan(0);
      expect(variant.focus.trim().length, `${variant.id}: пустой focus`).toBeGreaterThan(0);
      expectComplete(checkSelfWorkAnswer(variant.task1.model, variant.task1.keyPoints), `exam/${variant.id}/task1`);
      expectComplete(checkSelfWorkAnswer(variant.task3.model, variant.task3.keyPoints), `exam/${variant.id}/task3`);
    }
  });

  it("task3.detailKeyPoints непусты и detailModel их закрывает (иначе «5» недостижима)", () => {
    const t = requireTopic();
    for (const variant of t.exam.variants) {
      const task3 = variant.task3;
      const detailPoints = task3.detailKeyPoints ?? [];
      expect(detailPoints.length, `exam/${variant.id}/task3: нет detailKeyPoints — оценка «5» недостижима`).toBeGreaterThan(0);
      for (const point of detailPoints) {
        expect(point.anyOf.length, `exam/${variant.id}/task3/detail/${point.id}: пустой anyOf`).toBeGreaterThan(0);
      }
      expect(
        String(task3.detailModel ?? "").trim().length,
        `exam/${variant.id}/task3: пустой detailModel`,
      ).toBeGreaterThan(0);
      expectComplete(
        checkSelfWorkAnswer(task3.detailModel, detailPoints),
        `exam/${variant.id}/task3/detail`,
      );
    }
  });

  it("электронограммы: ровно 2, подписи заполнены, модель закрывает все номера", () => {
    const t = requireTopic();
    const electronograms = t.exam.electronograms;
    expect(electronograms).toHaveLength(2);
    const seen = new Set<string>();
    for (const electronogram of electronograms) {
      expect(seen.has(electronogram.id), `дубль id электронограммы: ${electronogram.id}`).toBe(false);
      seen.add(electronogram.id);
      expect(String(electronogram.imageUrl ?? "").startsWith("/"), `${electronogram.id}: imageUrl не локальный путь`).toBe(true);
      expect(electronogram.caption.trim().length, `${electronogram.id}: пустой caption`).toBeGreaterThan(0);
      expect(electronogram.labels.length, `${electronogram.id}: нет подписей`).toBeGreaterThanOrEqual(5);
      const numbers = new Set<number>();
      for (const label of electronogram.labels) {
        expect(numbers.has(label.n), `${electronogram.id}: дубль номера подписи ${label.n}`).toBe(false);
        numbers.add(label.n);
        expect(label.label.trim().length, `${electronogram.id}/label-${label.n}: пустой label`).toBeGreaterThan(0);
        expect(label.anyOf.length, `${electronogram.id}/label-${label.n}: пустой anyOf`).toBeGreaterThan(0);
      }
      expectComplete(checkSelfWorkLabels(electronogram.model, electronogram.labels), `exam/${electronogram.id}`);
    }
  });

  it("шкала содержит ровно оценки 3, 4 и 5", () => {
    const t = requireTopic();
    expect(t.exam.scale.map((entry) => entry.grade).sort()).toEqual([3, 4, 5]);
    for (const entry of t.exam.scale) {
      expect(entry.when.trim().length, `scale/${entry.grade}: пустой when`).toBeGreaterThan(0);
      expect(entry.detail.trim().length, `scale/${entry.grade}: пустой detail`).toBeGreaterThan(0);
    }
  });

  it("памятка: >= 4 шагов, образцы непусты и проходят пункты памятки", () => {
    const t = requireTopic();
    const memo = t.exam.memo;
    expect(memo.steps.length).toBeGreaterThanOrEqual(4);
    for (const step of memo.steps) {
      expect(step.title.trim().length, "шаг памятки без title").toBeGreaterThan(0);
      expect(step.hint.trim().length, `шаг «${step.title}» без hint`).toBeGreaterThan(0);
    }
    expect(memo.samples.length).toBeGreaterThanOrEqual(2);

    const points = memoStepKeyPoints(t);
    for (const sample of memo.samples) {
      expect(sample.id.trim().length, "образец без id").toBeGreaterThan(0);
      expect(sample.title.trim().length, `${sample.id}: пустой title`).toBeGreaterThan(0);
      expect(sample.text.trim().length, `${sample.id}: пустой текст описания`).toBeGreaterThan(200);
      // Образец должен засчитываться по памятке так же, как его проверяет ExamModePanel.
      expectComplete(checkSelfWorkAnswer(sample.text, points), `exam/memo/${sample.id}`);
    }
  });
});

/* ── защита от «мёртвых» anyOf ───────────────────────────────────────────── */

describe("контент: anyOf-варианты живые", () => {
  it("каждый вариант матчится сам с собой (нет мёртвых строк)", () => {
    const t = requireTopic();
    const all = locatedKeyPoints(t);
    expect(all.length).toBeGreaterThan(80);

    const dead: string[] = [];
    let variants = 0;
    for (const { where, point } of all) {
      for (const variant of point.anyOf) {
        if (!String(variant).trim()) continue; // пустые ловит тест про anyOf выше
        variants += 1;
        if (!matchesSelfWorkKeyPoint(variant, { id: point.id, label: point.label, anyOf: [variant] })) {
          dead.push(`${where}: "${variant}"`);
        }
      }
    }
    expect(dead, `мёртвые anyOf-варианты (${dead.length}):\n${dead.join("\n")}`).toEqual([]);
    expect(variants).toBeGreaterThan(80);
  });

  it("наборы id пунктов не пусты и адреса уникальны", () => {
    const t = requireTopic();
    const addresses = locatedKeyPoints(t).map(({ where }) => where);
    const duplicates = addresses.filter((where, index) => addresses.indexOf(where) !== index);
    expect(duplicates, `дубли адресов пунктов: ${duplicates.join(", ")}`).toEqual([]);
  });
});