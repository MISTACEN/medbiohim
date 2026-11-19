import { createClient } from "@supabase/supabase-js";
import type { Env } from "../../env";
import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { STRICT_ADMINS, error, gate, type AdminApp } from "./shared";

/**
 * Аудит файлового хранилища и возможности рантайма.
 */
export function registerFiles(admin: AdminApp) {

  // Storage audit is strict-admin-only and uses the server key after the role gate.
  function createServiceDb(env: Env) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
    return key ? createClient(env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }) : null;
  }

  admin.get("/files/capabilities", requireAuth, async (c) => {
    const rid = requestId();
    if (!await gate(c, STRICT_ADMINS)) return;
    return c.json(ok({
      runtime: "cloudflare-workers",
      extensions: { gd: false, imagick: false, exif: false, fileinfo: true, mbstring: false },
      image: { webp_gd: false, avif_gd: false, webp_imagick: false, avif_imagick: false },
      commands: { ffmpeg: false, ffprobe: false, cwebp: false, avifenc: false },
      storage: {
        upstash_blob_configured: Boolean(c.env.UPSTASH_BLOB_TOKEN),
        redis_configured: Boolean(c.env.UPSTASH_REDIS_REST_URL && c.env.UPSTASH_REDIS_REST_TOKEN),
        b2_download_supported: false,
      },
      policy: { optimizer_mode: "capability_detect_then_quality_gate", original_deleted: false, video_full_hd_required: true },
    }, rid));
  });

  admin.get("/files/audit", requireAuth, async (c) => {
    const rid = requestId();
    if (!await gate(c, STRICT_ADMINS)) return;
    const db = createServiceDb(c.env);
    if (!db) return error(c, rid, 503, "SERVICE_DATABASE_NOT_CONFIGURED", "Storage audit is not configured");
    const limit = Math.max(1, Math.min(1000, Number(c.req.query("limit") || 200)));
    try {
      const count = async (query: any) => {
        const { count: value, error: queryError } = await query;
        if (queryError) throw queryError;
        return value || 0;
      };
      const [activeFiles, deletedFiles, missingObjectNull, missingObjectEmpty, missingHashNull, missingHashEmpty,
        b2Files, spacewebFiles, unknownFiles, processingFiles, failedProcessing] = await Promise.all([
        count(db.from("files").select("id", { count: "exact", head: true }).eq("status", "active")),
        count(db.from("files").select("id", { count: "exact", head: true }).eq("status", "deleted")),
        count(db.from("files").select("id", { count: "exact", head: true }).is("object_key", null)),
        count(db.from("files").select("id", { count: "exact", head: true }).eq("object_key", "")),
        count(db.from("files").select("id", { count: "exact", head: true }).is("sha256", null)),
        count(db.from("files").select("id", { count: "exact", head: true }).eq("sha256", "")),
        count(db.from("files").select("id", { count: "exact", head: true }).eq("storage_provider", "b2")),
        count(db.from("files").select("id", { count: "exact", head: true }).eq("storage_provider", "spaceweb")),
        count(db.from("files").select("id", { count: "exact", head: true }).eq("storage_provider", "unknown")),
        count(db.from("files").select("id", { count: "exact", head: true }).in("processing_status", ["queued", "processing"])),
        count(db.from("files").select("id", { count: "exact", head: true }).eq("processing_status", "failed")),
      ]);
      const { data: rows, error: rowsError } = await db.from("files")
        .select("id,original_name,mime_type,size_bytes,object_key,b2_file_id,uploaded_by,group_id,visibility,status,specialty_slug,sha256,storage_provider,processing_status,created_at")
        .eq("status", "active").order("created_at", { ascending: false }).limit(limit);
      if (rowsError) throw rowsError;
      const ids = (rows || []).map((row: any) => row.id).filter(Boolean);
      const loadRefs = async (table: string, column: string) => {
        if (!ids.length) return [] as any[];
        const { data, error: refsError } = await db.from(table).select(column).in(column, ids).not(column, "is", null);
        if (refsError) throw refsError;
        return data || [];
      };
      const [materials, trainers, attachments, submissions] = await Promise.all([
        loadRefs("materials", "file_id"),
        loadRefs("trainer_feed_cards", "source_file_id"),
        loadRefs("homework_attachments", "file_id"),
        loadRefs("homework_submissions", "file_id"),
      ]);
      const tally = (list: any[], column: string) => {
        const result = new Map<string, number>();
        for (const row of list) {
          const id = String(row[column] || "");
          if (id) result.set(id, (result.get(id) || 0) + 1);
        }
        return result;
      };
      const m = tally(materials, "file_id"), t = tally(trainers, "source_file_id");
      const ha = tally(attachments, "file_id"), hs = tally(submissions, "file_id");
      const items = (rows || []).map((row: any) => {
        const material_refs = m.get(String(row.id)) || 0;
        const trainer_refs = t.get(String(row.id)) || 0;
        const homework_attachment_refs = ha.get(String(row.id)) || 0;
        const homework_submission_refs = hs.get(String(row.id)) || 0;
        return { ...row, material_refs, trainer_refs, homework_attachment_refs, homework_submission_refs,
          total_refs: material_refs + trainer_refs + homework_attachment_refs + homework_submission_refs };
      }).sort((a: any, b: any) => a.total_refs - b.total_refs || String(b.created_at).localeCompare(String(a.created_at)));
      return c.json(ok({
        summary: {
          active_files: activeFiles, deleted_files: deletedFiles,
          missing_object_key: missingObjectNull + missingObjectEmpty,
          missing_sha256: missingHashNull + missingHashEmpty,
          b2_files: b2Files, spaceweb_files: spacewebFiles, unknown_files: unknownFiles,
          processing_files: processingFiles, failed_processing: failedProcessing,
        },
        items,
        b2: { configured: false, scanned: 0, matched_metadata: 0, missing_db_objects: 0, orphan_objects: 0, scan_truncated: false, error: null },
        upstash: { configured: Boolean(c.env.UPSTASH_BLOB_TOKEN), scan_performed: false, note: "metadata-only audit; no objects were mutated" },
        physical_check: "not_run",
        destructive_actions: false,
        limit,
      }, rid));
    } catch (auditError) {
      console.error("[admin:files-audit]", { error: String(auditError), requestId: rid });
      return error(c, rid, 503, "FILE_AUDIT_ERROR", "Storage audit is temporarily unavailable");
    }
  });

  admin.post("/files/:id/process-image", requireAuth, async (c) => {
    const rid = requestId();
    if (!await gate(c, STRICT_ADMINS)) return;
    return error(c, rid, 501, "MEDIA_PROCESSING_UNAVAILABLE", "Image processing is not available in the Cloudflare Worker runtime");
  });
}
