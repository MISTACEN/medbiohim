

export type PrepTopic = { topic_id: string | null; title: string; mastery_pct: number };

export type PrepItem = { kind: string; title: string; href: string; why: string; done: boolean };

export type PrepDay = { date: string; label: string; items: PrepItem[] };

export type PrepReadiness = {
  subject_slug: string | null;
  subject_name: string | null;
  event_date: string | null;
  days_left: number | null;
  mastery_pct: number | null;
  topics: PrepTopic[];
  source: "curriculum" | "progress" | "none";
};

export type EventRow = {
  id?: string | null;
  date?: string | null;
  event_kind?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
};

export type ProgressRow = {
  topic_id?: string;
  percent?: number | null;
  topic_name?: string | null;
  subject_id?: string | null;
};
