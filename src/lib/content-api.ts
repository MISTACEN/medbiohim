import { api, getTrainerImageUrl } from "@/lib/api";

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
};

export { getTrainerImageUrl };

export async function listSubjectMaterials(
  params: { subjectId?: string; subjectSlug?: string; type?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.subjectId) q.set("subject_id", params.subjectId);
  if (params.subjectSlug) q.set("subject_slug", params.subjectSlug);
  if (params.type) q.set("type", params.type);
  const s = q.toString() ? "?" + q.toString() : "";
  return api<{ items: SubjectMaterial[]; source: string }>("/subject-materials" + s);
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
  return api<{ items: TrainerCard[]; limit: number; offset: number; source: string }>(
    `/trainers/feed?${q.toString()}`,
  );
}

export async function submitTrainerAnswer(payload: {
  card_id: string;
  option_id?: string;
  answer_text?: string;
  is_skipped?: boolean;
  time_ms?: number;
}) {
  return api<{ answer: Record<string, unknown>; correct: boolean | null }>(
    "/trainers/feed/answer",
    { method: "POST", body: JSON.stringify(payload) },
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
  layout_mode: TrainingLayout;
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
