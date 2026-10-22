/**
 * Universal attestation model: colloquium, exam, credit, test or control work
 * for any subject. Stored as one site_content row per attestation:
 *   key = attestation:<subject_slug>:<slug>
 *
 * The model is validated here so the public and admin routes share one contract.
 */

export const ATTESTATION_TYPES = ["colloquium", "exam", "credit", "test", "control"] as const;
export const ITEM_KINDS = ["theory", "test", "task"] as const;

export type AttestationType = (typeof ATTESTATION_TYPES)[number];
export type AttestationItemKind = (typeof ITEM_KINDS)[number];

export type AttestationItem = {
  id: string;
  kind: AttestationItemKind;
  title: string;
  body?: string;
  answer?: string;
  explanation?: string;
  options?: string[];
  correct?: number[];
};

export type AttestationStage = {
  id: string;
  title: string;
  description?: string;
  items: AttestationItem[];
};

export type Attestation = {
  slug: string;
  subject_slug: string;
  subject_name?: string;
  type: AttestationType;
  title: string;
  description?: string;
  course_number?: number;
  semester?: number;
  pass_score?: number;
  is_published: boolean;
  available_from?: string | null;
  available_to?: string | null;
  stages: AttestationStage[];
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;

export function attestationKey(subject: string, slug: string) {
  return `attestation:${subject}:${slug}`;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function optionalText(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

/** Returns normalized attestation or an error message in Russian. */
export function normalizeAttestation(input: unknown): { value?: Attestation; error?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Ожидается объект аттестации" };
  const raw = input as Record<string, unknown>;

  const slug = text(raw.slug, 64);
  const subject = text(raw.subject_slug, 64);
  const title = text(raw.title, 200);
  const type = String(raw.type || "colloquium") as AttestationType;

  if (!slug || !SLUG.test(slug)) return { error: "slug: латиница, цифры и дефис, до 64 символов" };
  if (!subject || !SLUG.test(subject)) return { error: "subject_slug: латиница, цифры и дефис, до 64 символов" };
  if (!title) return { error: "Укажите название аттестации" };
  if (!ATTESTATION_TYPES.includes(type)) return { error: "Неизвестный тип аттестации" };

  if (!Array.isArray(raw.stages)) return { error: "Добавьте хотя бы один этап" };
  const stages: AttestationStage[] = [];
  for (const [stageIndex, stageRaw] of raw.stages.entries()) {
    if (!stageRaw || typeof stageRaw !== "object") return { error: `Этап ${stageIndex + 1}: ожидается объект` };
    const stage = stageRaw as Record<string, unknown>;
    const stageTitle = text(stage.title, 200);
    if (!stageTitle) return { error: `Этап ${stageIndex + 1}: укажите название` };
    if (!Array.isArray(stage.items)) return { error: `Этап ${stageIndex + 1}: добавьте материалы` };
    if (stage.items.length > 300) return { error: `Этап ${stageIndex + 1}: не более 300 материалов` };

    const items: AttestationItem[] = [];
    for (const [itemIndex, itemRaw] of stage.items.entries()) {
      if (!itemRaw || typeof itemRaw !== "object") return { error: `Этап ${stageIndex + 1}, материал ${itemIndex + 1}: ожидается объект` };
      const item = itemRaw as Record<string, unknown>;
      const kind = String(item.kind || "theory") as AttestationItemKind;
      if (!ITEM_KINDS.includes(kind)) return { error: `Материал ${itemIndex + 1}: неизвестный тип` };
      const itemTitle = text(item.title, 500);
      if (!itemTitle) return { error: `Этап ${stageIndex + 1}, материал ${itemIndex + 1}: укажите текст вопроса` };

      const normalized: AttestationItem = {
        id: text(item.id, 64) || `item-${stageIndex + 1}-${itemIndex + 1}`,
        kind,
        title: itemTitle,
      };
      if (!ID.test(normalized.id)) normalized.id = `item-${stageIndex + 1}-${itemIndex + 1}`;

      const body = optionalText(item.body, 20000);
      if (body) normalized.body = body;
      const answer = optionalText(item.answer, 20000);
      if (answer) normalized.answer = answer;
      const explanation = optionalText(item.explanation, 20000);
      if (explanation) normalized.explanation = explanation;

      if (kind === "test") {
        const options = Array.isArray(item.options)
          ? item.options.map((option) => String(option ?? "").trim()).filter(Boolean).slice(0, 12)
          : [];
        if (options.length < 2) return { error: `Материал ${itemIndex + 1}: нужно минимум два варианта ответа` };
        const correct = Array.isArray(item.correct)
          ? [...new Set(item.correct.map((value) => Number(value)).filter((value) => Number.isInteger(value)))]
          : [];
        if (!correct.length || correct.some((index) => index < 0 || index >= options.length)) {
          return { error: `Материал ${itemIndex + 1}: отметьте правильные варианты` };
        }
        normalized.options = options;
        normalized.correct = correct.sort((a, b) => a - b);
      }

      items.push(normalized);
    }

    const description = optionalText(stage.description, 2000);
    stages.push({
      id: text(stage.id, 64) || `stage-${stageIndex + 1}`,
      title: stageTitle,
      ...(description ? { description } : {}),
      items,
    });
  }
  if (!stages.length) return { error: "Добавьте хотя бы один этап" };

  const passScoreRaw = raw.pass_score === undefined || raw.pass_score === null ? 70 : Number(raw.pass_score);
  if (!Number.isFinite(passScoreRaw) || passScoreRaw < 0 || passScoreRaw > 100) {
    return { error: "Проходной балл должен быть от 0 до 100" };
  }

  const course = raw.course_number === undefined || raw.course_number === null ? undefined : Number(raw.course_number);
  const semester = raw.semester === undefined || raw.semester === null ? undefined : Number(raw.semester);
  if (course !== undefined && (!Number.isInteger(course) || course < 1 || course > 6)) return { error: "Курс должен быть от 1 до 6" };
  if (semester !== undefined && (!Number.isInteger(semester) || semester < 1 || semester > 12)) return { error: "Семестр должен быть от 1 до 12" };

  const value: Attestation = {
    slug,
    subject_slug: subject,
    type,
    title,
    is_published: raw.is_published === true,
    pass_score: Math.round(passScoreRaw),
    stages,
  };
  const subjectName = optionalText(raw.subject_name, 200);
  if (subjectName) value.subject_name = subjectName;
  const description = optionalText(raw.description, 5000);
  if (description) value.description = description;
  if (course !== undefined) value.course_number = course;
  if (semester !== undefined) value.semester = semester;
  const availableFrom = optionalText(raw.available_from, 40);
  const availableTo = optionalText(raw.available_to, 40);
  value.available_from = availableFrom || null;
  value.available_to = availableTo || null;

  return { value };
}

export function summarizeAttestation(value: Attestation) {
  const items = value.stages.reduce((sum, stage) => sum + stage.items.length, 0);
  const tests = value.stages.reduce((sum, stage) => sum + stage.items.filter((item) => item.kind === "test").length, 0);
  const tasks = value.stages.reduce((sum, stage) => sum + stage.items.filter((item) => item.kind === "task").length, 0);
  return {
    slug: value.slug,
    subject_slug: value.subject_slug,
    subject_name: value.subject_name || null,
    type: value.type,
    title: value.title,
    description: value.description || null,
    course_number: value.course_number ?? null,
    semester: value.semester ?? null,
    pass_score: value.pass_score ?? 70,
    is_published: value.is_published,
    available_from: value.available_from || null,
    available_to: value.available_to || null,
    stages_count: value.stages.length,
    items_count: items,
    tests_count: tests,
    tasks_count: tasks,
  };
}

/** Availability window check; missing dates mean always available. */
export function attestationAvailable(value: Attestation, now = new Date()) {
  const from = value.available_from ? Date.parse(value.available_from) : NaN;
  const to = value.available_to ? Date.parse(value.available_to) : NaN;
  if (Number.isFinite(from) && now.getTime() < from) return false;
  if (Number.isFinite(to) && now.getTime() > to) return false;
  return true;
}
