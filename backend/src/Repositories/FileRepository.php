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
            "SELECT f.* FROM public.files f
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

    public function softDelete(string $id): bool
    {
        $stmt = $this->db->prepare("UPDATE public.files SET status = 'deleted' WHERE id = :id AND status <> 'deleted'");
        $stmt->execute(['id' => $id]);
        return $stmt->rowCount() > 0;
    }
}
