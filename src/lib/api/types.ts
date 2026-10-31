/**
 * Доменные типы клиента same-origin API (TECH-AUDIT-PLAN-2026-10-27 §6, D1/D5).
 * Типы объявлены как type-алиасы (не interface), чтобы оставались совместимы
 * с `Record<string, unknown>`-хелперами в клиентском коде (str(row, ...) и т.п.).
 */
import {
  // D1: доменные типы переиспользуются из type guards (src/lib/guards.ts),
  // чтобы guard'ы и типы не расходились.
  type Announcement,
  type Profile,
  type ScheduleRow,
  type SubjectCard,
  type TestItem,
} from "@/lib/guards";

export type ApiSuccess<T> = { ok: true; data: T; requestId: string; stale?: boolean };
export type ApiError = { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string };
export type ApiResult<T> = ApiSuccess<T> | ApiError;

/** Академическое событие (/academic/state → upcoming). */
export type AcademicEvent = {
  id?: string;
  subject_name?: string | null;
  event_kind?: string | null;
  date?: string | null;
  start_time?: string | null;
  room?: string | null;
  [key: string]: unknown;
};

/** Слабая тема (/academic/state → weak_topics). */
export type AcademicWeakTopic = {
  topic_id?: string;
  subject_name?: string | null;
  topic_name?: string | null;
  percent?: number | null;
  [key: string]: unknown;
};

/** Рекомендация AI/правил (/academic/state → recommendations). */
export type AcademicRecommendation = {
  title?: string | null;
  reason?: string | null;
  when?: string | null;
  where?: string | null;
  subject_id?: string | null;
  schedule_entry_id?: string | null;
  topic_id?: string | null;
  [key: string]: unknown;
};

/** Незакрытое академическое требование (/academic/state → debts). */
export type AcademicDebt = {
  id?: string;
  subject_name?: string | null;
  note?: string | null;
  [key: string]: unknown;
};

/** Числовой прогресс по темам (/academic/state → topic_progress). */
export type AcademicTopicProgress = {
  topic_id?: string;
  percent?: number | null;
  [key: string]: unknown;
};

/** Снимок состояния учебного элемента (/academic/state → states). */
export type AcademicStateRow = {
  id?: string;
  target_type?: string;
  target_id?: string;
  learning_status?: string;
  academic_status?: string;
  execution_status?: string;
  note?: string | null;
  [key: string]: unknown;
};

export type AcademicMetrics = {
  closed?: number | null;
  in_progress?: number | null;
  not_started?: number | null;
  debts?: number | null;
  tracked?: number | null;
  [key: string]: unknown;
};

export type AcademicSession = {
  id?: string;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  type?: string | null;
  [key: string]: unknown;
};

export type AcademicPlan = {
  available?: boolean;
  items?: number | null;
  concrete_items?: number | null;
  message?: string | null;
  [key: string]: unknown;
};

/** Шаг AI-плана подготовки (/academic/ai-plan → items). */
export type AcademicPlanItem = {
  target_id?: string;
  order_index?: number | null;
  title?: string | null;
  [key: string]: unknown;
};

/** Полное академическое состояние студента (/academic/state). */
export type AcademicState = {
  profile?: Profile;
  session: AcademicSession | null;
  plan: AcademicPlan | null;
  metrics: AcademicMetrics | null;
  debts: AcademicDebt[];
  upcoming: AcademicEvent[];
  weak_topics: AcademicWeakTopic[];
  recommendations: AcademicRecommendation[];
  states?: AcademicStateRow[];
  topic_progress?: AcademicTopicProgress[];
  generated_at?: string;
};

/** Карточка предмета — общий домен с guard'ом isSubjectCard. */
export type Subject = SubjectCard;

/** Занятие в расписании: домен поверх guard-типа ScheduleRow. */
export type ScheduleEntry = ScheduleRow & {
  // start_time/end_time обязательны на практике: клиент рендерит их напрямую.
  start_time: string;
  end_time: string;
  type?: string | null;
  room?: string | null;
  building?: string | null;
  teacher?: string | null;
  notes?: string | null;
  is_makeup?: boolean | null;
  week_parity?: string | null;
  academic_hours?: number | null;
  attendance_status?: string | null;
  breaks?: string[];
  source?: string | null;
  source_detail?: string | null;
  course_number?: number | null;
  semester?: number | null;
  group_id?: string | null;
  group_name?: string | null;
  group_code?: string | null;
  [key: string]: unknown;
};

/** Историческое имя домена занятия — сохранено для существующих импортов. */
export type ScheduleItem = ScheduleEntry;

export type SchedulePeriod = {
  id?: string;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

export type ScheduleDurationRule = {
  [key: string]: unknown;
};

export type ScheduleMeta = {
  periods: SchedulePeriod[];
  duration_rules: ScheduleDurationRule[];
  [key: string]: unknown;
};

/** Неделя учебного плана предмета (/subject-plans). */
export type SubjectPlanWeek = {
  date?: string | null;
  week?: number | null;
  lecture?: string | null;
  practice?: string | null;
  control?: string | null;
  study?: string[];
  preparations?: unknown[];
  [key: string]: unknown;
};

/** Учебный план предмета (/subject-plans/:slug). */
export type SubjectPlan = {
  subject?: Subject;
  weeks?: SubjectPlanWeek[];
  control?: string | null;
  [key: string]: unknown;
};

/** Домашнее задание в блоках главной страницы (/dashboard → homeworks). */
export type DashboardHomework = {
  id?: string;
  title?: string | null;
  due_at?: string | null;
  my_status?: string | null;
  submission_status?: string | null;
  status?: string | null;
  subject_id?: string | null;
  subjectId?: string | null;
  [key: string]: unknown;
};

/** Тест в блоках главной страницы (/dashboard → tests). */
export type DashboardTestSummary = {
  id?: string;
  title?: string | null;
  name?: string | null;
  subject_name?: string | null;
  [key: string]: unknown;
};

/** Полезная нагрузка /dashboard. */
export type Dashboard = {
  announcements: Announcement[];
  homeworks: DashboardHomework[];
  schedule: ScheduleEntry[];
  tests: DashboardTestSummary[];
  degraded?: boolean;
  degraded_sources?: string[];
  service_notice?: string | null;
  [key: string]: unknown;
};

/** Полезная нагрузка /subjects (listSubjects). */
export type SubjectListData = {
  items: SubjectCard[];
  total?: number;
  [key: string]: unknown;
};

/** Полезная нагрузка /tests (listTests). */
export type TestListData = {
  items: TestItem[];
  total?: number;
  [key: string]: unknown;
};

/** Полезная нагрузка /schedule (listSchedule). */
export type ScheduleListData = {
  items: ScheduleEntry[];
  source?: string;
  [key: string]: unknown;
};

/**
 * University portal imports (ФЕСМУ/ЕИОС/manual selection).
 * Additive helpers for docs/UNIVERSITY-INTEGRATION-CONTRACT.md §3 — the Worker
 * route deduplicates by SHA-256(url) per user and caps a request at 50 items.
 */
export type IntegrationImportKind = "announcement" | "event" | "document" | "topic" | "link";
export type IntegrationImportSource = "eios" | "neofamily" | "sechenov" | "fesmu" | "other";
export type IntegrationImportInput = {
  title: string;
  url: string;
  kind: IntegrationImportKind;
  source: IntegrationImportSource;
  summary?: string;
  published_at?: string | null;
};
export type IntegrationImportRecord = {
  id: string;
  key: string;
  title: string;
  url: string;
  kind: string;
  source: string;
  imported_at: string;
  summary?: string;
};
export type IntegrationImportsData = { items: IntegrationImportRecord[]; count: number };
export type IntegrationImportResult = { imported: number; skipped: number; items: IntegrationImportRecord[] };

export type QuestionComment = { id: string; question_id: string; user_id: string; body: string; created_at: string; author_name: string; author_avatar: string | null };

export type ApiTest = any;

export type MyAssignmentStatus = "passed" | "failed" | "pending" | "retake_needed";
export type MyAssignment = { id: string; subject: string; topic: string; due_date: string | null; status: MyAssignmentStatus; grade: string | null; note: string | null; source: "manual" | "csv"; created_at?: string; updated_at?: string };

export type AdminDatabaseConnection = {
  id: string;
  slug: string;
  label: string;
  driver: "pgsql" | "mysql";
  host: string;
  port: number | null;
  database_name: string;
  username: string;
  password_configured?: boolean;
  sslmode?: string | null;
  charset?: string | null;
  enabled?: boolean;
  builtin?: boolean;
  status?: "unknown" | "connected" | "failed" | "untested";
  last_test_ok?: boolean | null;
  last_tested_at?: string | null;
  last_error?: string | null;
  updated_at?: string | null;
};

export type AdminDbRow = any;
export type AdminDbMeta = any;
export type AdminContentImportPayload = any;
export type ApiHomework = any;
export type ApiMaterial = any;
export type BankQuestion = any;
export type Lecture = any;
export type LectureListItem = any;
export type PreparationQuestion = any;
export type TelegramAdminChat = any;
export type TrainerFeedCard = any;
