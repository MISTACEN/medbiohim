#!/usr/bin/env node
/**
 * One-time, resumable migration of the extracted content/histology tree to private Upstash Blob.
 *
 * Run from integrations/cloudflare-api:
 *   node scripts/migrate-histology-blob.mjs "C:\\path\\to\\extracted\\content\\histology" --dry-run
 *   node scripts/migrate-histology-blob.mjs "C:\\path\\to\\extracted\\content\\histology"
 *
 * Requires UPSTASH_BLOB_TOKEN for the existing private medbiohim-files bucket.
 * No secrets are read from files or written to logs. Existing keys with matching SHA-256 are skipped.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SOURCE_ARCHIVE_SHA256 = "4cbd44020f675a7232fe086e8e39c9c5d4a15652be810fb37758066180432b73";
const DEFAULT_MAX_SIZE = 15 * 1024 * 1024;
const MIME_TYPES = new Map([
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"],
  [".gif", "image/gif"], [".webp", "image/webp"], [".svg", "image/svg+xml"],
  [".pdf", "application/pdf"], [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".json", "application/json"], [".md", "text/markdown"], [".txt", "text/plain"],
  [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"],
]);

export function mimeTypeFor(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

export function safeObjectKey(key) {
  const value = String(key || "");
  if (!value || value.includes("\\") || value.startsWith("/") || value.length > 1024 || /[?#\u0000-\u001f]/u.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part && part !== "." && part !== "..");
}

async function listFiles(root, current = root, result = []) {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await listFiles(root, absolute, result);
    } else if (entry.isFile()) {
      const objectKey = path.relative(root, absolute).split(path.sep).join("/");
      if (!safeObjectKey(objectKey)) throw new Error(`Unsafe object path refused: ${objectKey}`);
      const meta = await stat(absolute);
      result.push({
        source_path: absolute,
        archive_path: `content/histology/${objectKey}`,
        object_key: objectKey,
        size_bytes: meta.size,
        mime_type: mimeTypeFor(objectKey),
      });
    } else {
      throw new Error(`Unsupported non-regular entry refused: ${absolute}`);
    }
  }
  return result;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArguments(argv) {
  const args = { source: "", dryRun: false, overwrite: false, limit: 0, manifestOut: "medbiohim-histology-blob-manifest.json", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--overwrite") args.overwrite = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else if (item === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error("--limit must be a positive integer");
      args.limit = n;
    } else if (item === "--manifest-out") {
      const value = argv[++i];
      if (!value) throw new Error("--manifest-out requires a path");
      args.manifestOut = value;
    } else if (item.startsWith("-")) {
      throw new Error(`Unknown option: ${item}`);
    } else if (!args.source) args.source = item;
    else throw new Error("Only one source directory may be supplied");
  }
  return args;
}

function printHelp() {
  console.log("Usage: node scripts/migrate-histology-blob.mjs <extracted-content/histology-dir> [--dry-run] [--limit N] [--overwrite] [--manifest-out FILE]");
  console.log("The source must be the extracted folder that directly contains electronograms/, em/, and 5_Фотографии препаратов/.");
  console.log("Dry-run calculates sizes and SHA-256 without credentials or network access.");
}

async function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (args.help) return printHelp();
  if (!args.source) {
    printHelp();
    process.exitCode = 2;
    return;
  }

  const root = path.resolve(args.source);
  const rootInfo = await stat(root).catch(() => null);
  if (!rootInfo?.isDirectory()) throw new Error("Source must be an existing extracted histology directory");
  let entries = await listFiles(root);
  if (!entries.length) throw new Error("No regular files found under source directory");
  entries.sort((a, b) => a.object_key < b.object_key ? -1 : a.object_key > b.object_key ? 1 : 0);
  if (args.limit) entries = entries.slice(0, args.limit);

  const hashes = new Set();
  let totalBytes = 0;
  let imageCount = 0;
  let pdfCount = 0;
  let docCount = 0;
  for (const entry of entries) {
    const bytes = await readFile(entry.source_path);
    entry.sha256 = digest(bytes);
    totalBytes += entry.size_bytes;
    if (entry.mime_type.startsWith("image/")) imageCount += 1;
    if (entry.mime_type === "application/pdf") pdfCount += 1;
    if (entry.mime_type === "application/msword" || entry.mime_type.includes("wordprocessingml")) docCount += 1;
    hashes.add(entry.sha256);
    delete entry.source_path;
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    source_archive_sha256: SOURCE_ARCHIVE_SHA256,
    source_root: root,
    entries: entries.length,
    uncompressed_bytes: totalBytes,
    unique_sha256: hashes.size,
    duplicate_content_entries: entries.length - hashes.size,
    image_entries: imageCount,
    pdf_entries: pdfCount,
    word_document_entries: docCount,
    files: entries,
  };
  await writeFile(path.resolve(args.manifestOut), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    dry_run: args.dryRun,
    entries: manifest.entries,
    uncompressed_bytes: manifest.uncompressed_bytes,
    unique_sha256: manifest.unique_sha256,
    duplicate_content_entries: manifest.duplicate_content_entries,
    image_entries: imageCount,
    pdf_entries: pdfCount,
    word_document_entries: docCount,
    manifest_out: path.resolve(args.manifestOut),
  }, null, 2));

  if (args.dryRun) return;
  const token = String(process.env.UPSTASH_BLOB_TOKEN || "").trim();
  if (!token) throw new Error("UPSTASH_BLOB_TOKEN is missing. Set it in this shell only; never put it in Git.");
  const { Bucket, BlobError } = await import("@upstash/blob");
  const bucket = new Bucket({ token, enableTelemetry: false, cache: "no-store" });
  let uploaded = 0;
  let skipped = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const sourcePath = path.join(root, ...entry.object_key.split("/"));
    const bytes = await readFile(sourcePath);
    const sha256 = digest(bytes);
    if (bytes.byteLength !== entry.size_bytes || sha256 !== entry.sha256) {
      throw new Error(`Source changed after inventory; refusing to upload: ${entry.object_key}`);
    }

    let existing = null;
    try {
      existing = await bucket.info(entry.object_key);
    } catch (error) {
      if (!(BlobError.is(error) && error.code === "not_found")) throw error;
    }
    if (existing) {
      if (Number(existing.size) === entry.size_bytes && existing.metadata?.sha256 === entry.sha256) {
        skipped += 1;
        console.log(`[${i + 1}/${entries.length}] skip verified ${entry.object_key}`);
        continue;
      }
      if (!args.overwrite) {
        throw new Error(`Object exists with different or missing SHA-256 metadata: ${entry.object_key}. Review it first or explicitly pass --overwrite.`);
      }
    }

    const isLarge = bytes.byteLength > 16_000_000;
    const options = {
      contentType: entry.mime_type,
      cache: "no-store",
      metadata: { sha256: entry.sha256, source_archive_sha256: SOURCE_ARCHIVE_SHA256 },
      maxSize: Math.max(DEFAULT_MAX_SIZE, bytes.byteLength),
      ...(isLarge ? { multipart: true } : (args.overwrite ? {} : { allowOverwrite: false })),
    };
    await bucket.put(entry.object_key, bytes, options);
    const verified = await bucket.info(entry.object_key);
    if (Number(verified.size) !== entry.size_bytes || verified.metadata?.sha256 !== entry.sha256) {
      throw new Error(`Post-upload verification failed for ${entry.object_key}; do not mark it complete.`);
    }
    uploaded += 1;
    console.log(`[${i + 1}/${entries.length}] uploaded and verified ${entry.object_key} (${entry.size_bytes} bytes)`);
  }
  console.log(JSON.stringify({ completed: true, uploaded, skipped, total: entries.length, manifest_out: path.resolve(args.manifestOut) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Migration stopped safely: ${error?.message || "unknown error"}`);
    process.exitCode = 1;
  });
}
