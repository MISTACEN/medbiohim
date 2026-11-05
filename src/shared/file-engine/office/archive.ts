/**
 * Просмотр архива без распаковки.
 *
 * Читается только центральный каталог ZIP: вложенные файлы не извлекаются,
 * поэтому «zip-бомба» не разворачивается в память. Проверяются имена
 * (path traversal), глубина, число записей и коэффициент сжатия.
 */
import JSZip from "jszip";
import { DEFAULT_LIMITS } from "../limits";
import type { PreviewLimits } from "../types";
import { checkArchiveBudget, sanitizeArchiveEntries, type ArchiveEntry } from "../security";

export type ArchiveListingEntry = ArchiveEntry & {
  compressedSize: number;
  uncompressedSize: number;
};

export type ArchiveListing = {
  entries: ArchiveListingEntry[];
  rejected: string[];
  totalEntries: number;
  compressedSize: number;
  uncompressedSize: number;
  warnings: string[];
  truncated: boolean;
};

type ZipInternal = { _data?: { compressedSize?: number; uncompressedSize?: number } };

export async function listZip(
  data: ArrayBuffer | Uint8Array,
  limits: PreviewLimits = DEFAULT_LIMITS,
): Promise<ArchiveListing> {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files);
  const warnings: string[] = [];

  const listing: ArchiveListingEntry[] = [];
  const rejected: string[] = [];
  let compressedSize = 0;
  let uncompressedSize = 0;

  for (const name of names) {
    const source = zip.files[name];
    if (!source) continue;
    const internal = source as unknown as ZipInternal;
    const compressed = Number(internal._data?.compressedSize ?? 0) || 0;
    const uncompressed = Number(internal._data?.uncompressedSize ?? 0) || 0;

    const sanitized = sanitizeArchiveEntries([name], limits);
    if (!sanitized.entries.length) {
      rejected.push(name);
      continue;
    }
    const entry = sanitized.entries[0];
    listing.push({ ...entry, compressedSize: compressed, uncompressedSize: uncompressed });
    compressedSize += compressed;
    uncompressedSize += uncompressed;
  }

  const budget = checkArchiveBudget(
    listing.map((entry) => ({
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
    })),
    limits,
  );
  if (!budget.ok) warnings.push(budget.message);
  if (rejected.length) {
    warnings.push(`${rejected.length} записей с небезопасными путями не показаны.`);
  }

  return {
    entries: listing,
    rejected,
    totalEntries: names.length,
    compressedSize,
    uncompressedSize,
    warnings,
    truncated: names.length > listing.length || listing.length >= limits.maxArchiveEntries,
  };
}
