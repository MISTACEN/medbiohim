
import { Bucket } from "@upstash/blob";
import type { Env } from "../../env";
import histologyDriveIndex from "../../data/histology-drive-index.json";

export function getBlobBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token, enableTelemetry: false, cache: "no-store" }) : null;
}

export type TrainerRow = {
  id: string;
  subject_slug?: string | null;
  specialty_slug?: string | null;
  mode_set?: string | null;
  source_key?: string | null;
  preparation?: Record<string, unknown> | null;
  question?: Record<string, unknown> | null;
  tags?: string[] | null;
  difficulty?: number | null;
  plan_module_id?: string | null;
  plan_topic_id?: string | null;
  plan_status?: string | null;
  modules?: { title?: string | null } | Array<{ title?: string | null }> | null;
  topics?: { title?: string | null } | Array<{ title?: string | null }> | null;
  is_published?: boolean;
};

export function cleanLegacyPath(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/^content\/histology\//, "")
    .replace(/^histology\//, "");
}

export function safeObjectKey(value: string): string {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f\u007f]/u.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

/** Expand relative/absolute paths into bare + histology/ + content/histology/ forms. */
export function withHistologyPrefixes(relativeOrAbsolute: string): string[] {
  const keys: string[] = [];
  const add = (v: string) => {
    const k = safeObjectKey(v);
    if (k && !keys.includes(k)) keys.push(k);
  };
  const raw = String(relativeOrAbsolute || "").trim().replace(/^\/+/, "");
  if (!raw) return keys;
  add(raw);
  const stripped = cleanLegacyPath(raw);
  if (stripped) {
    add("histology/" + stripped); // live public bucket layout
    add(stripped);
    add("content/histology/" + stripped);
  }
  return keys;
}

/**
 * Ordered Blob object keys for a trainer card.
 * Live bucket uses histology/… prefix (verified: histology/electronograms/images/apoptoz.png = 200).
 * Cards often store only a basename in preparation.imagePath — expand under photo roots.
 */
// roots include "photos/" for legacy aliases
export function trainerImageCandidateKeys(card: {
  source_key?: string | null;
  mode_set?: string | null;
  preparation?: Record<string, unknown> | null;
}, fileObjectKey: string | null = null): string[] {
  const keys: string[] = [];
  const add = (v: string) => {
    for (const k of withHistologyPrefixes(v)) {
      if (!keys.includes(k)) keys.push(k);
    }
  };

  if (fileObjectKey) {
    add(fileObjectKey);
    return keys;
  }

  if (card.source_key) add(String(card.source_key));

  const preparation = card.preparation && typeof card.preparation === "object" ? card.preparation : {};
  const imagePath = cleanLegacyPath(String(preparation.imagePath || ""));
  const imageUrl = cleanLegacyPath(String(preparation.imageUrl || ""));
  add(imagePath);
  add(imageUrl);

  const base = (imagePath || imageUrl).split("/").pop() || "";
  if (base && !base.includes("..")) {
    if (card.mode_set === "electronogram") {
      add("electronograms/images/" + base);
      add("em/" + base);
    }
    // preparation (and unknown mode): try SpaceWeb photo tree
    if (card.mode_set === "preparation" || !card.mode_set) {
      const photoRoot = "5_Фотографии препаратов/";
      const subfolders = [
        "",
        "частная гистология/",
        "цитология, эмбриология и общая гистология/",
        "стом. гистология/",
      ];
      if (imagePath.includes("/")) add(photoRoot + imagePath);
      if (imageUrl.includes("/")) add(photoRoot + imageUrl);
      for (const sub of subfolders) add(photoRoot + sub + base);
    }
  }
  return keys;
}

export function mapTrainerCard(row: TrainerRow, orderIndex: number) {
  const preparation = row.preparation || {};
  const question = (row.question || {}) as { prompt?: unknown; mode?: unknown; options?: unknown };
  const options = Array.isArray(question.options)
    ? question.options.map((option: unknown, index: number) => {
        const item = option as { id?: unknown; label?: unknown };
        return { id: String(item.id ?? index), label: String(item.label ?? "") };
      })
    : [];
  const moduleRow = Array.isArray(row.modules) ? row.modules[0] : row.modules;
  const topicRow = Array.isArray(row.topics) ? row.topics[0] : row.topics;
  return {
    id: row.id,
    plan_module_id: row.plan_module_id || null,
    plan_topic_id: row.plan_topic_id || null,
    plan_status: row.plan_status || null,
    plan_module_title: moduleRow?.title || null,
    plan_topic_title: topicRow?.title || null,
    title: String(preparation.name || preparation.organ || question.prompt || "Карточка тренажёра"),
    topic: Array.isArray(row.tags) ? String(row.tags[0] || row.subject_slug || "histology") : (row.subject_slug || "histology"),
    kind: row.mode_set || String(question.mode || "identify"),
    order_index: orderIndex,
    has_image: Boolean(preparation.imageUrl || preparation.imagePath),
    prompt: String(question.prompt || ""),
    options,
    preparation,
    tags: row.tags || [],
    difficulty: row.difficulty ?? null,
  };
}

export type HistologyDriveItem = { path: string; name: string; id: string; kind: "image" | "document"; mime: string };
export const HISTOLOGY_DRIVE_ITEMS = (histologyDriveIndex as { items: HistologyDriveItem[] }).items;

export function normalizeDriveValue(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\\/g, "/")
    .replace(/^\/+|^\.\//g, "")
    .replace(/^content\/histology\//i, "")
    .replace(/^histology\//i, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .trim();
}

export function normalizeDriveTitle(value: string): string {
  return normalizeDriveValue(value)
    .replace(/\.docx$/i, "")
    .replace(/[()!.,:;—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve public Drive files from a checked-in index generated from the shared histology folder. */
export function findHistologyDriveItem(
  card: { mode_set?: string | null; preparation?: Record<string, unknown> | null },
  candidates: string[],
): HistologyDriveItem | null {
  const preparation = card.preparation && typeof card.preparation === "object" ? card.preparation : {};
  if (card.mode_set === "electronogram") {
    const title = String(preparation.name || preparation.organ || "").trim();
    if (!title) return null;
    return HISTOLOGY_DRIVE_ITEMS.find((item) =>
      item.kind === "document" && normalizeDriveTitle(item.name) === normalizeDriveTitle(title)
    ) || null;
  }

  const imageItems = HISTOLOGY_DRIVE_ITEMS.filter((item) => item.kind === "image");
  const driveCandidates = [
    ...candidates,
    String(preparation.imagePath || ""),
    String(preparation.imageUrl || ""),
  ].filter(Boolean);
  // Prefer full relative paths so duplicate basenames in different folders remain unambiguous.
  for (const candidate of driveCandidates) {
    const normalized = normalizeDriveValue(cleanLegacyPath(candidate));
    if (!normalized.includes("/")) continue;
    const found = imageItems.find((item) => normalizeDriveValue(item.path) === normalized);
    if (found) return found;
  }

  // Last resort: accept a basename only if it is unique in the shared folder index.
  const basenames = new Set<string>();
  for (const candidate of driveCandidates) {
    const basename = normalizeDriveValue(cleanLegacyPath(candidate).split("/").pop() || "");
    if (basename) basenames.add(basename);
  }
  for (const basename of basenames) {
    const matches = imageItems.filter((item) => normalizeDriveValue(item.name) === basename);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export function imageContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "application/octet-stream";
}
