export type AttestationType = "colloquium" | "exam" | "credit" | "test" | "control";
export type AttestationItemKind = "theory" | "test" | "task";

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

export type AttestationSummary = {
  slug: string;
  subject_slug: string;
  subject_name: string | null;
  type: AttestationType;
  title: string;
  description: string | null;
  course_number: number | null;
  semester: number | null;
  pass_score: number;
  is_published: boolean;
  available_from: string | null;
  available_to: string | null;
  stages_count: number;
  items_count: number;
  tests_count: number;
  tasks_count: number;
  updated_at?: string | null;
};

export const ATTESTATION_TYPE_LABELS: Record<AttestationType, string> = {
  colloquium: "Коллоквиум",
  exam: "Экзамен",
  credit: "Зачёт",
  test: "Тест",
  control: "Контрольная",
};
