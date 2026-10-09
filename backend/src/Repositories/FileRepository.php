<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use PDO;

final class FileRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function create(array $data): array
    {
        $stmt = $this->db->prepare(
            "INSERT INTO public.files
                (original_name, mime_type, size_bytes, object_key, b2_file_id,
                 uploaded_by, group_id, visibility, status, specialty_slug,
                 sha256, storage_provider, processing_status)
             VALUES (:name, :mime, :size, :key, :b2id, :by, :gid, :vis, 'active', :specialty,
                     :sha256, :provider, :processing)
             RETURNING *"
        );
        $stmt->execute([
            'name' => $data['original_name'],
            'mime' => $data['mime_type'] ?? null,
            'size' => $data['size_bytes'] ?? null,
            'key' => $data['object_key'],
            'b2id' => $data['b2_file_id'] ?? null,
            'by' => $data['uploaded_by'] ?? null,
            'gid' => $data['group_id'] ?? null,
            'vis' => $data['visibility'] ?? 'group',
            'specialty' => ($data['specialty_slug'] ?? '') !== '' ? $data['specialty_slug'] : null,
            'sha256' => ($data['sha256'] ?? '') !== '' ? $data['sha256'] : null,
            'provider' => in_array(($data['storage_provider'] ?? 'unknown'), ['b2','spaceweb','external','unknown'], true)
                ? (string)($data['storage_provider'] ?? 'unknown') : 'unknown',
            'processing' => in_array(($data['processing_status'] ?? 'ready'), ['ready','queued','processing','failed','skipped'], true)
                ? (string)($data['processing_status'] ?? 'ready') : 'ready',
        ]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new \RuntimeException('File metadata insert failed');
        }
        return $row;
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare("SELECT * FROM public.files WHERE id = :id AND status <> 'deleted' LIMIT 1");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string,mixed>> */
    public function assertAccess(string $fileId, string $userId): array
    {
        $stmt = $this->db->prepare(
            "SELECT f.*,
                    EXISTS (
                        SELECT 1
                        FROM public.materials m
                        JOIN public.subjects s ON s.id = m.subject_id
                        WHERE m.file_id = f.id AND s.slug = 'histology'
                    ) AS is_histology_material
             FROM public.files f
             WHERE f.id=:id AND f.status='active'
               AND (
                 f.uploaded_by=:uid
                 OR f.visibility='public'
                 OR EXISTS (
                    SELECT 1 FROM public.group_memberships gm
                    WHERE gm.group_id=f.group_id AND gm.user_id=:uid2 AND gm.is_active=true
                 )
               )
             LIMIT 1"
        );
        $stmt->execute(['id'=>$fileId,'uid'=>$userId,'uid2'=>$userId]);
        $row=$stmt->fetch();
        if($row===false) throw new \RuntimeException('File is not accessible');
        return $row;
    }

    public function listForUser(string $userId, int $limit = 50): array
    {
        // Keep listing semantics aligned with assertAccess(): a group-visible file
        // must be visible to active members of that group, not only to its uploader.
        $stmt = $this->db->prepare(
            "SELECT f.* FROM public.files f
             WHERE f.status = 'active'
               AND (
                 f.uploaded_by = :uid
                 OR f.visibility = 'public'
                 OR (
                   f.group_id IS NOT NULL
                   AND EXISTS (
                     SELECT 1
                     FROM public.group_memberships gm
                     WHERE gm.group_id = f.group_id
                       AND gm.user_id = :uid2
                       AND gm.is_active = true
                   )
                 )
               )
             ORDER BY f.created_at DESC
             LIMIT :lim"
        );
        $stmt->bindValue('uid', $userId, PDO::PARAM_STR);
        $stmt->bindValue('uid2', $userId, PDO::PARAM_STR);
        $stmt->bindValue('lim', max(1, min($limit, 100)), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll() ?: [];
    }

    /** @return list<array<string,mixed>> */
    public function listActive(?string $groupId = null, int $limit = 500): array
    {
        $sql = "SELECT f.* FROM public.files f WHERE f.status = 'active'";
        $params = [];
        if ($groupId !== null && trim($groupId) !== '') {
            $sql .= " AND f.group_id = :gid";
            $params['gid'] = trim($groupId);
        }
        $sql .= " ORDER BY f.created_at DESC LIMIT :lim";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v, PDO::PARAM_STR);
        $stmt->bindValue('lim', max(1, min($limit, 2000)), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll() ?: [];
    }

    /** Non-destructive metadata reconciliation with complete read-only B2 reconciliation. */
    public function storageAudit(int $limit = 200): array
    {
        $limit = max(1, min($limit, 1000));

        $summaryStmt = $this->db->query(
            "SELECT
                count(*) FILTER (WHERE status = 'active') AS active_files,
                count(*) FILTER (WHERE status = 'deleted') AS deleted_files,
                count(*) FILTER (WHERE object_key = '' OR object_key IS NULL) AS missing_object_key,
                count(*) FILTER (WHERE sha256 = '' OR sha256 IS NULL) AS missing_sha256,
                count(*) FILTER (WHERE storage_provider = 'b2') AS b2_files,
                count(*) FILTER (WHERE storage_provider = 'spaceweb') AS spaceweb_files,
                count(*) FILTER (WHERE storage_provider = 'unknown') AS unknown_files,
                count(*) FILTER (WHERE processing_status IN ('queued','processing')) AS processing_files,
                count(*) FILTER (WHERE processing_status = 'failed') AS failed_processing
             FROM public.files"
        );
        $summary = $summaryStmt->fetch() ?: [];

        $sql = "
            SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.object_key,
                   f.b2_file_id, f.uploaded_by, f.group_id, f.visibility, f.status,
                   f.specialty_slug, f.sha256, f.storage_provider, f.processing_status, f.created_at,
                   COALESCE(m.material_refs,0) AS material_refs,
                   COALESCE(t.trainer_refs,0) AS trainer_refs,
                   COALESCE(ha.homework_attachment_refs,0) AS homework_attachment_refs,
                   COALESCE(hs.homework_submission_refs,0) AS homework_submission_refs,
                   (
                     COALESCE(m.material_refs,0) + COALESCE(t.trainer_refs,0) +
                     COALESCE(ha.homework_attachment_refs,0) + COALESCE(hs.homework_submission_refs,0)
                   ) AS total_refs
              FROM public.files f
              LEFT JOIN (
                SELECT file_id, count(*) AS material_refs
                  FROM public.materials
                 WHERE file_id IS NOT NULL
                 GROUP BY file_id
              ) m ON m.file_id = f.id
              LEFT JOIN (
                SELECT source_file_id AS file_id, count(*) AS trainer_refs
                  FROM public.trainer_feed_cards
                 WHERE source_file_id IS NOT NULL
                 GROUP BY source_file_id
              ) t ON t.file_id = f.id
              LEFT JOIN (
                SELECT file_id, count(*) AS homework_attachment_refs
                  FROM public.homework_attachments
                 WHERE file_id IS NOT NULL
                 GROUP BY file_id
              ) ha ON ha.file_id = f.id
              LEFT JOIN (
                SELECT file_id, count(*) AS homework_submission_refs
                  FROM public.homework_submissions
                 WHERE file_id IS NOT NULL
                 GROUP BY file_id
              ) hs ON hs.file_id = f.id
             WHERE f.status = 'active'
             ORDER BY total_refs ASC, f.created_at DESC
             LIMIT :lim";
        $stmt = $this->db->prepare($sql);
        $stmt->bindValue('lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll() ?: [];

        $b2Audit = [
            'configured' => false,
            'scanned' => 0,
            'matched_metadata' => 0,
            'missing_db_objects' => 0,
            'orphan_objects' => 0,
            'scan_truncated' => false,
            'error' => null,
        ];

        $storage = new B2Storage();
        if ($storage->isConfigured()) {
            $b2Audit['configured'] = true;
            try {
                // Build the complete set of B2-backed metadata keys independently
                // from the UI item limit. This prevents false "orphan" results.
                $dbKeys = [];
                $dbStmt = $this->db->query(
                    "SELECT object_key
                       FROM public.files
                      WHERE status = 'active'
                        AND object_key IS NOT NULL
                        AND object_key <> ''
                        AND (storage_provider = 'b2' OR NULLIF(b2_file_id,'') IS NOT NULL)"
                );
                while ($row = $dbStmt->fetch()) {
                    $key = trim((string)($row['object_key'] ?? ''));
                    if ($key !== '') $dbKeys[$key] = false;
                }

                // Walk all B2 pages, not just the first 5000 objects.
                $startFileName = null;
                do {
                    $page = $storage->listObjects(null, 5000, $startFileName);
                    $b2Objects = $page['files'] ?? [];
                    $b2Audit['scanned'] += count($b2Objects);

                    foreach ($b2Objects as $object) {
                        $name = trim((string)($object['file_name'] ?? ''));
                        if ($name !== '' && array_key_exists($name, $dbKeys)) {
                            $dbKeys[$name] = true;
                            $b2Audit['matched_metadata']++;
                        } else {
                            $b2Audit['orphan_objects']++;
                        }
                    }

                    $next = isset($page['nextFileName']) ? trim((string)$page['nextFileName']) : '';
                    $startFileName = $next !== '' ? $next : null;
                    $b2Audit['scan_truncated'] = $startFileName !== null;
                } while ($startFileName !== null);

                $b2Audit['missing_db_objects'] = count(array_filter(
                    $dbKeys,
                    static fn(bool $matched): bool => !$matched
                ));
                // A completed pagination loop means the scan itself was not truncated.
                $b2Audit['scan_truncated'] = false;
            } catch (\Throwable $e) {
                $b2Audit['error'] = 'B2 scan failed';
            }
        }

        return [
            'summary' => array_map(
                static fn($v) => is_numeric($v) ? (int)$v : $v,
                $summary
            ),
            'items' => $items,
            'b2' => $b2Audit,
            'physical_check' => $b2Audit['configured'] ? 'b2_read_only_full_scan' : 'not_run',
            'destructive_actions' => false,
        ];
    }

    public function softDelete(string $id): bool
    {
        $stmt = $this->db->prepare("UPDATE public.files SET status = 'deleted' WHERE id = :id AND status <> 'deleted'");
        $stmt->execute(['id' => $id]);
        return $stmt->rowCount() > 0;
    }
}
