/**
 * Frozen view shapes for docs/UNIVERSITY-INTEGRATION-CONTRACT.md §2.
 *
 * Most fields stay optional on purpose: `/api/university` returns `ok:true` with
 * per-section errors and the UI must keep rendering when a feed, the schedule or
 * an older deployment returns less than the full shape. Never invent a value
 * that the API did not send — show «нет данных» instead.
 */
export type FeedKind = "news" | "announcements" | "events";

export type FeedItem = {
  title: string;
  url: string;
  /** Human date as published by the source, `dd.mm.yyyy`. */
  date?: string | null;
  /** Derived ISO date (`YYYY-MM-DD`) when the adapter could parse one. */
  date_iso?: string | null;
  /** Russian label of the news category (`для абитуриентов`, ...). */
  section?: string | null;
  source?: string;
  kind?: string;
};

export type Feed = {
  source: string;
  label: string;
  items: FeedItem[];
  error?: string | null;
  cached?: boolean;
  stale?: boolean;
  fetched_at?: string | null;
};

export type Faculty = {
  id: string;
  slug?: string;
  title: string;
  short?: string;
  program?: string | null;
  code?: string | null;
  url: string;
};

export type ScheduleItem = {
  title: string;
  title_source?: "page" | "filename" | string;
  url: string;
  course?: string | null;
  course_number?: number | null;
  semester?: string | null;
  stream?: string | null;
  kind?: string;
  kind_label?: string;
  format?: string | null;
  context?: string | null;
  is_debt?: boolean;
};

export type ServiceCategory = "portal" | "lms" | "schedule" | "library" | "testing" | "news" | string;

export type ServiceStatus = {
  id: string;
  title: string;
  url: string;
  category?: ServiceCategory;
  description?: string;
  badge?: string;
  /** `null` = the probe has not run yet («не проверено»). */
  reachable?: boolean | null;
  http_status?: number | null;
  latency_ms?: number | null;
  checked_at?: string | null;
  note?: string;
};

export type Portal = {
  name?: string;
  url?: string;
  eios_url?: string;
  testing_url?: string;
  library_url?: string;
  schedule_url?: string;
  news_url?: string;
  announcements_url?: string;
  events_url?: string;
};

export type ScheduleSection = {
  index_url?: string;
  note?: string;
  faculties?: Faculty[];
  documents?: ScheduleItem[];
  cached?: boolean;
  stale?: boolean;
  fetched_at?: string | null;
  error?: string | null;
};

export type UniversityOverview = {
  ok?: boolean;
  fetched_at?: string;
  portal?: Portal;
  disclaimer?: string;
  services?: ServiceStatus[];
  schedule?: ScheduleSection;
  feeds?: Partial<Record<FeedKind, Feed>>;
  error?: string;
};

export type FacultyScheduleResponse = {
  ok?: boolean;
  faculty?: Faculty;
  fetched_at?: string;
  source?: string;
  cached?: boolean;
  stale?: boolean;
  cache_age_seconds?: number | null;
  items?: ScheduleItem[];
  error?: string | null;
};
