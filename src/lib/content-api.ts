import { api, apiCached, getTrainerImageUrl } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export type SubjectMaterial = {
  id: string;
  subject_id: string;
  subject_name?: string | null;
  subject_slug?: string | null;
  type: string;
  title: string;
  content_html?: string | null;
  external_url?: string | null;
  source_key?: string | null;
  order_index?: number | null;
  module_id?: string | null;
  topic_id?: string | null;
  module_title?: string | null;
  topic_title?: string | null;
  source?: {
    id?: string | null;
    key?: string | null;
    name?: string | null;
    source_path?: string | null;
    original_format?: string | null;
    mime_type?: string | null;
    size_bytes?: number | null;
    download_url?: string | null;
  } | null;
};

export type TrainerCard = {
  id: string;
  subject_id?: string | null;
  subject_slug: string;
  specialty_slug?: string | null;
  mode_set?: string;
  preparation?: {
    name?: string;
    organ?: string;
    stain?: string;
    imagePath?: string;
    imageUrl?: string;
    sourceDocx?: string;
    /** Подписи из Word (только для режима «изучение» у ЭМ) */
    captions?: string[];
    studySource?: "docx" | "image";
    examSource?: "image" | "docx";
  };
  hotspots?: unknown[];
  question?: {
    prompt?: string;
    mode?: string;
    explanation?: string;
    allowSkip?: boolean;
    options?: Array<{ id: string; label: string; correct?: boolean }>;
  };
  tags?: string[];
  difficulty?: number | null;
  source_key?: string | null;
  /** Привязка к учебному плану (для группировки «по темам занятий») */
  plan_module_id?: string | null;
  plan_topic_id?: string | null;
  plan_module_title?: string | null;
  plan_topic_title?: string | null;
};

export { getTrainerImageUrl };

export async function listSubjectMaterials(
  params: { subjectId?: string; subjectSlug?: string; type?: string } = {},
  options: RequestInit = {},
) {
  const q = new URLSearchParams();
  if (params.subjectId) q.set("subject_id", params.subjectId);
  if (params.subjectSlug) q.set("subject_slug", params.subjectSlug);
  if (params.type) q.set("type", params.type);
  const s = q.toString() ? "?" + q.toString() : "";
  return apiCached<{ items: SubjectMaterial[]; source: string }>("/subject-materials" + s, options);
}

export async function getContentSource(id: string) {
  return api<{
    source: {
      id: string;
      title: string;
      source_path: string;
      mime_type?: string | null;
      original_format?: string | null;
      source_archive?: string | null;
      note?: string | null;
    };
  }>(`/content-sources/${encodeURIComponent(id)}`);
}

export type HistologySourceFile = {
  name: string;
  path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  updated_at?: string | null;
};

export async function listHistologySourceFiles(folder = "Учебники") {
  return api<{ items: HistologySourceFile[]; folder: string; source: string; status?: string }>(
    `/histology/source-materials?folder=${encodeURIComponent(folder)}`,
  );
}

export async function listTrainerFeed(
  subject = "histology",
  specialty = "mbh",
  limit = 50,
  offset = 0,
) {
  const q = new URLSearchParams({
    subject,
    specialty,
    limit: String(limit),
    offset: String(offset),
  });
  return apiCached<{ items: TrainerCard[]; limit: number; offset: number; source: string }>(
    `/trainers/feed?${q.toString()}`,
  );
}

export type TrainingLayout = "sidebar" | "list" | "top";
export type TrainingLabelMode = "with" | "without" | "manual";
export type TrainingContentType = "all" | "preparation" | "electronogram";

export type TrainingQuestion = {
  id: string;
  mode_set?: string;
  preparation?: Record<string, unknown>;
  question?: { prompt?: string; explanation?: string | null; allowSkip?: boolean };
  options: Array<{ id: string; label: string; correct?: boolean }>;
  hotspots?: unknown[];
  tags?: string[];
  difficulty?: number | null;
};

export type Training = {
  id: string;
  topics: string[];
  content_type: TrainingContentType;
  question_count: number;
  label_mode: TrainingLabelMode;
  layout_mode: TrainingLayout;
  status: "in_progress" | "completed" | "cancelled";
  current_index: number;
  score?: number | null;
  total_questions: number;
  answered_count?: number;
};

export async function listTrainings(status?: string) {
  return api<{ items: Training[] }>(`/trainings${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}

export async function createHistologyTraining(payload: {
  topics: string[];
  content_type: TrainingContentType;
  question_count: number;
  all_questions: boolean;
  label_mode: TrainingLabelMode;
  layout_mode?: TrainingLayout;
  /** Конкретные карточки (id из feed) — приоритет над random count */
  card_ids?: string[];
  force?: boolean;
}) {
  return api<{ training: Training; questions: TrainingQuestion[] }>("/trainings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTraining(id: string) {
  return api<{ training: Training; answers: Array<{
    id: string;
    question_id: string;
    order: number;
    user_answer?: string | null;
    is_correct?: boolean | null;
    is_skipped?: boolean;
    options: Array<{ id: string; label: string; correct?: boolean }>;
    question_snapshot: TrainingQuestion;
    review_snapshot?: Record<string, unknown>;
  }> }>(`/trainings/${encodeURIComponent(id)}`);
}

export async function answerTrainingQuestion(id: string, order: number, userAnswer: string | null, skipped = false) {
  return api<{ answer: Record<string, unknown>; correct: boolean | null }>(
    `/trainings/${encodeURIComponent(id)}/answer`,
    { method: "POST", body: JSON.stringify({ order, user_answer: userAnswer, is_skipped: skipped }) },
  );
}

export async function completeTraining(id: string) {
  return api<{ training: Training; stats: { total: number; correct: number; wrong: number; skipped: number; percent: number; grade: number } }>(
    `/trainings/${encodeURIComponent(id)}/complete`,
    { method: "POST", body: "{}" },
  );
}


export async function cancelTraining(id: string) {
  return api<{ training: Training }>(`/trainings/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: "{}",
  });
}

// --- Методические карточки микропрепаратов ---------------------------------
// Гиды приходят из /preparations/guides (миграция 20261120). Пока миграция не
// применена, воркер отдаёт пустой список с migrated: false, и атлас работает
// без методичек — а не падает.

export type PreparationGuideSummary = {
  key: string;
  name: string;
  section?: string | null;
  system?: string | null;
  organ?: string | null;
  tissue?: string | null;
  stain?: string | null;
  difficulty?: number | null;
  structures?: string[] | null;
};

export type PreparationGuideSource = {
  manual?: string;
  page?: number;
  file_id?: string;
  url?: string;
};

export type PreparationGuideDetail = PreparationGuideSummary & {
  low_magnification?: string | null;
  high_magnification?: string | null;
  steps?: string[] | null;
  features?: string[] | null;
  inclusions?: string[] | null;
  differential?: string[] | null;
  mistakes?: string[] | null;
  sources?: PreparationGuideSource[] | null;
};

export async function listPreparationGuides() {
  return apiCached<{ items: PreparationGuideSummary[]; total: number; migrated: boolean }>(
    endpoints.preparations.guides(),
  );
}

export async function getPreparationGuide(key: string) {
  return api<{ item: PreparationGuideDetail; migrated: boolean }>(endpoints.preparations.guide(key));
}

export type PreparationStructure = { slug: string; title: string; kind: string; sort_order?: number | null };

export async function listPreparationStructures() {
  return apiCached<{ items: PreparationStructure[]; migrated: boolean }>(
    endpoints.preparations.structures(),
  );
}

// --- Свои препараты студента ------------------------------------------------
// Личные карточки владельца (`public.user_preparations` под RLS). Кэш здесь не
// используется: список меняется сразу после добавления или удаления.

export type MyPreparation = {
  id: string;
  subject_slug: string;
  name: string;
  organ: string | null;
  stain: string | null;
  description: string | null;
  /** Готовая ссылка на фото: внешняя, статическая или подписанная Worker’ом. */
  image: string | null;
  image_expires_at: string | null;
  created_at: string;
};

export async function listMyPreparations(subjectSlug = "histology") {
  const query = new URLSearchParams({ subject: subjectSlug }).toString();
  return api<{ items: MyPreparation[]; count: number }>(
    endpoints.content.trainersMyPreparations(query),
  );
}

export async function createMyPreparation(payload: {
  name: string;
  organ?: string;
  stain?: string;
  description?: string;
  image_url?: string;
  file_id?: string | null;
  subject_slug?: string;
}) {
  return api<{ item: { id: string } }>(endpoints.content.trainersMyPreparations(), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteMyPreparation(id: string) {
  return api<{ deleted: boolean }>(endpoints.content.trainersMyPreparation(id), {
    method: "DELETE",
  });
}
