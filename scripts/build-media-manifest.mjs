// Собирает манифест крупных медиа, которые не кладутся в public/ и идут в B2.
// Ничего не загружает и не меняет: только читает файлы и считает sha256.
//
//   node scripts/build-media-manifest.mjs <каталог-источник> [out.json]
//
// Объектный ключ строится как library/<предмет>/<slug>.<ext>, чтобы совпадать
// с тем, что ожидает отдача файлов по material-file-url.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith("--out="));
const ROOTS = args.filter((a) => !a.startsWith("--"));
const OUT = outArg ? outArg.slice(6) : "docs/media-upload-manifest.json";
const MIN_BYTES = 20 * 1024 * 1024; // всё, что меньше, обычно помещается в public/
const EXTS = new Set([".mp4", ".mov", ".pdf", ".zip", ".rar", ".tar", ".gz", ".doc", ".docx"]);

const SUBJECT_BY_HINT = [
  [/гистолог|histolog|атлас по гистологии/i, "histology"],
  [/физиолог|fiziolog|agadzhanyan|sudakov|brin|chesnokov/i, "physiology"],
  [/хим|chem/i, "chemistry"],
  [/матем|matan/i, "math"],
];

const MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

if (!ROOTS.length) {
  console.error("usage: node build-media-manifest.mjs <dir> [dir...] [--out=file.json]");
  process.exit(2);
}
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".vercel"]);

const slugify = (value) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const translit = (value) => {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e",
    ю: "yu", я: "ya",
  };
  return value
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
};

function subjectFor(name) {
  for (const [re, slug] of SUBJECT_BY_HINT) if (re.test(name)) return slug;
  return "misc";
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
}

const files = [];
for (const root of ROOTS) if (fs.existsSync(root)) walk(root, files);

const entries = [];
for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!EXTS.has(ext)) continue;
  const size = fs.statSync(file).size;
  if (size < MIN_BYTES) continue;

  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));

  const base = path.basename(file, path.extname(file));
  const subject = subjectFor(`${file} ${base}`);
  const slug = slugify(translit(base)) || "file";
  entries.push({
    source: file,
    relative: path.basename(file),
    subject,
    object_key: `library/${subject}/${slug}${ext}`,
    mime_type: MIME[ext] || "application/octet-stream",
    size_bytes: size,
    sha256: hash.digest("hex"),
  });
}

// Один и тот же файл часто лежит в нескольких копиях исходных папок:
// загружать его дважды не нужно, оставляем первое вхождение по sha256.
const byHash = new Map();
for (const entry of entries) if (!byHash.has(entry.sha256)) byHash.set(entry.sha256, entry);
const unique = [...byHash.values()];
const duplicates = entries.length - unique.length;

unique.sort((a, b) => b.size_bytes - a.size_bytes);

const manifest = {
  generated_at: new Date().toISOString(),
  source_roots: ROOTS.map((r) => path.resolve(r)),
  min_size_bytes: MIN_BYTES,
  total_files: unique.length,
  duplicate_copies_skipped: duplicates,
  total_bytes: unique.reduce((n, e) => n + e.size_bytes, 0),
  entries: unique,
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 1) + "\n", "utf8");

const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`уникальных файлов: ${unique.length} (пропущено копий-дублей: ${duplicates}), суммарно ${mb(manifest.total_bytes)} МБ`);
for (const e of unique) console.log(`  ${mb(e.size_bytes).padStart(7)} МБ  ${e.subject.padEnd(10)} ${e.object_key}`);
console.log(`манифест: ${OUT}`);
