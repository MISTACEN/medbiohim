<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use PDO;

final class FileVariantRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function upsert(string $parentFileId, array $data): array
    {
        $stmt = $this->db->prepare(
            "INSERT INTO public.file_variants
                (parent_file_id, variant_key, mime_type, size_bytes, object_key, b2_file_id,
                 sha256, width, height, duration_ms, processing_status)
             VALUES (:parent, :key, :mime, :size, :object, :b2, :sha, :width, :height, :duration, :status)
             ON CONFLICT (parent_file_id, variant_key) DO UPDATE SET
                 mime_type=EXCLUDED.mime_type,
                 size_bytes=EXCLUDED.size_bytes,
                 object_key=EXCLUDED.object_key,
                 b2_file_id=EXCLUDED.b2_file_id,
                 sha256=EXCLUDED.sha256,
                 width=EXCLUDED.width,
                 height=EXCLUDED.height,
                 duration_ms=EXCLUDED.duration_ms,
                 processing_status=EXCLUDED.processing_status
             RETURNING *"
        );
        $stmt->execute([
            'parent' => $parentFileId,
            'key' => (string)$data['variant_key'],
            'mime' => $data['mime_type'] ?? null,
            'size' => $data['size_bytes'] ?? null,
            'object' => (string)$data['object_key'],
            'b2' => $data['b2_file_id'] ?? null,
            'sha' => $data['sha256'] ?? null,
            'width' => $data['width'] ?? null,
            'height' => $data['height'] ?? null,
            'duration' => $data['duration_ms'] ?? null,
            'status' => $data['processing_status'] ?? 'ready',
        ]);
        $row = $stmt->fetch();
        if ($row === false) throw new RuntimeException('File variant insert failed');
        return $row;
    }

    public function listForFile(string $parentFileId): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM public.file_variants
             WHERE parent_file_id = :parent
             ORDER BY size_bytes ASC NULLS LAST, created_at ASC"
        );
        $stmt->execute(['parent' => $parentFileId]);
        return $stmt->fetchAll() ?: [];
    }

    public function markStatus(string $parentFileId, string $variantKey, string $status): void
    {
        if (!in_array($status, ['ready','queued','processing','failed','skipped'], true)) {
            throw new InvalidArgumentException('Invalid file variant processing status');
        }
        $stmt = $this->db->prepare(
            "UPDATE public.file_variants
             SET processing_status = :status
             WHERE parent_file_id = :parent AND variant_key = :key"
        );
        $stmt->execute(['status' => $status, 'parent' => $parentFileId, 'key' => $variantKey]);
    }
}
