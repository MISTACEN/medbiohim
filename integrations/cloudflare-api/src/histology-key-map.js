/**
 * Resolve historical SpaceWeb histology paths to private Upstash Blob keys.
 * User-uploaded files are deliberately excluded: their object_key must remain
 * exact so a legacy alias cannot cross a group/file authorization boundary.
 */

export function safeHistologyObjectKey(value) {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f]/.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

function cleanLegacyPath(value) {
  return String(value || "").trim().replace(/^\/+/, "")
    .replace(/^content\/histology\//, "").replace(/^histology\//, "");
}

function addPathAliases(keys, value) {
  const raw = String(value || "").trim().replace(/^\/+/, "");
  const cleaned = cleanLegacyPath(raw);
  for (const candidate of [raw, cleaned, cleaned && `histology/${cleaned}`, cleaned && `content/histology/${cleaned}`]) {
    const safe = safeHistologyObjectKey(candidate);
    if (safe && !keys.includes(safe)) keys.push(safe);
  }
}

/** Candidate keys for published corpus cards without a file-table reference. */
export function trainerCorpusCandidateKeys(card = {}) {
  const keys = [];
  addPathAliases(keys, card.source_key);
  const preparation = card.preparation && typeof card.preparation === "object" ? card.preparation : {};
  const imagePath = String(preparation.imagePath || "").trim();
  const imageUrl = String(preparation.imageUrl || "").trim();
  addPathAliases(keys, imagePath);
  addPathAliases(keys, imageUrl);

  const normalized = cleanLegacyPath(imagePath || imageUrl);
  const basename = normalized.split("/").pop() || "";
  if (basename && !basename.includes("..") && card.mode_set === "electronogram") {
    addPathAliases(keys, `electronograms/images/${basename}`);
    addPathAliases(keys, `em/${basename}`);
  }
  return keys;
}

export function materialSourceCandidateKeys(sourcePath = "") {
  const keys = [];
  const path = String(sourcePath || "").trim();
  if (!path) return keys;
  const leaf = path.split("/").pop() || "";
  addPathAliases(keys, path);

  if (path.startsWith("photos/")) {
    addPathAliases(keys, path.slice("photos/".length));
    for (const folder of [
      "5_Фотографии препаратов/стом. гистология/",
      "5_Фотографии препаратов/цитология, эмбриология и общая гистология/",
      "5_Фотографии препаратов/частная гистология/",
    ]) addPathAliases(keys, folder + leaf);
  }
  if (path.startsWith("electronograms/docx/") || path.startsWith("1_Экзаменационные электронограммы_")) {
    addPathAliases(keys, "electronograms/docx/" + leaf);
  }
  if (path && !/^(source-materials|electronograms|em|5_Фотографии препаратов|photos|histology|content\/histology|1_Экзаменационные электронограммы_)(\/|$)/.test(path)) {
    addPathAliases(keys, `source-materials/${path}`);
  }
  return keys;
}

export const PREPARATION_PHOTO_PREFIXES = [
  "5_Фотографии препаратов/",
  "histology/5_Фотографии препаратов/",
  "content/histology/5_Фотографии препаратов/",
];
