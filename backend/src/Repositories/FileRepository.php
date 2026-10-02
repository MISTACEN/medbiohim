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
                 uploaded_by, group_id, visibility, status, specialty_slug)
             VALUES (:name, :mime, :size, :key, :b2id, :by, :gid, :vis, 'active', :specialty)
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
    public function listForUser(string $userId, int $limit = 50): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM public.files
             WHERE status = 'active' AND (uploaded_by = :uid OR visibility = 'public')
             ORDER BY created_at DESC
             LIMIT :lim"
        );
        $stmt->bindValue('uid', $userId, PDO::PARAM_STR);
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
