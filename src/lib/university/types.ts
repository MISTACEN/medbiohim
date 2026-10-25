/**
 * Frozen types for the FESMU (ДВГМУ) university integration.
 *
 * These shapes are fixed by docs/UNIVERSITY-INTEGRATION-CONTRACT.md §2 and are
 * coded against in parallel by the /university UI. Do not rename, remove or
 * retype a field without asking the Lead first.
 */

/** Press-center feeds exposed on the overview payload. */
export type FeedKind = "news" | "announcements" | "events";

/** Categories used by the service registry (contract §1.5). */
export type ServiceCategory = "portal" | "lms" | "schedule" | "library" | "testing" | "news";

/** Document classes recognised on faculty schedule pages (contract §1.4). */
export type ScheduleKind =
  | "lectures"
  | "classes"
  | "exams"
  | "practice-exams"
  | "credits"
  | "debt"
  | "gia"
  | "diploma"
  | "process-graph"
  | "other";

/** Formats kept from faculty/schedule pages; everything else is ignored. */
export type DocumentFormat = "pdf" | "doc" | "docx" | "xls" | "xlsx";

/** Where a schedule item title came from. */
export type TitleSource = "page" | "filename";

export type Semester = "осенний" | "весенний";

/** One of the six schedule units from contract §1.4. */
export type Faculty = {
  id: string;
  slug: string;
  title: string;
  short: string;
  program: string | null;
  code: string | null;
  url: string;
};

/** A single press-center card. `date` stays in the source `dd.mm.yyyy` form. */
export type FeedItem = {
  title: string;
  url: string;
  date: string | null;
  date_iso: string | null;
  section: string | null;
  source: string;
  kind: FeedKind;
};

export type Feed = {
  source: string;
  label: string;
  items: FeedItem[];
  error: string | null;
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
};

/**
 * A PDF/DOC/XLS document from a faculty page or from the schedule index.
 * `type` is set to `"document"` only for the global schedule-index documents
 * required by contract §1.4; faculty items leave it undefined.
 */
export type ScheduleItem = {
  title: string;
  title_source: TitleSource;
  url: string;
  course: string | null;
  course_number: number | null;
  semester: Semester | null;
  stream: string | null;
  kind: ScheduleKind;
  kind_label: string;
  format: DocumentFormat;
  context: string | null;
  is_debt: boolean;
  type?: "document" | "schedule";
};

export type ServiceStatus = {
  id: string;
  title: string;
  url: string;
  category: ServiceCategory;
  description: string;
  badge: string;
  reachable: boolean | null;
  http_status: number | null;
  latency_ms: number | null;
  checked_at: string | null;
  note: string;
};

export type PortalInfo = {
  name: string;
  url: string;
  eios_url: string;
  testing_url: string;
  library_url: string;
  schedule_url: string;
  news_url: string;
  announcements_url: string;
  events_url: string;
};

/** Global schedule section on the overview payload. */
export type SchedulePage = {
  index_url: string;
  note: string;
  faculties: Faculty[];
  documents: ScheduleItem[];
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
  error: string | null;
};

/** `GET /api/university` (no `faculty`/`status` query). */
export type Overview = {
  ok: boolean;
  fetched_at: string;
  portal: PortalInfo;
  disclaimer: string;
  services: ServiceStatus[];
  schedule: SchedulePage;
  feeds: Record<FeedKind, Feed>;
  error?: string;
};

/** `GET /api/university?faculty=<id>` and `GET /api/university/schedule?faculty=<id>`. */
export type FacultySchedule = {
  ok: boolean;
  faculty: Faculty;
  fetched_at: string;
  source: string;
  cached: boolean;
  stale: boolean;
  cache_age_seconds: number | null;
  items: ScheduleItem[];
  error: string | null;
};

/** `GET /api/university/status` and `GET /api/university?status=1`. */
export type ServiceStatusReport = {
  ok: boolean;
  fetched_at: string;
  services: ServiceStatus[];
};

/** Result of the low-level transport; never throws. */
export type FesmuResponse = {
  ok: boolean;
  status: number;
  body: string;
  error: string | null;
};
