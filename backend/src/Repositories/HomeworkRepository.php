<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use Medbiohim\Services\B2Storage;
use PDO;

final class HomeworkRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function listForUser(string $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT h.id, h.title, h.description, h.due_at, COALESCE(h.due_date,(h.due_at AT TIME ZONE 'Asia/Vladivostok')::date) AS due_date, h.subject_id, h.group_id, h.created_by, h.created_by_role,
                    s.name AS subject_name, s.slug AS subject_slug, s.color_hex,
                    sub.id AS submission_id, sub.status AS submission_status,
                    sub.grade, sub.submitted_at,
                    hp.completed AS my_completed, hp.submitted_at AS completed_at
             FROM public.homeworks h
             LEFT JOIN public.subjects s ON s.id = h.subject_id
             LEFT JOIN public.homework_submissions sub
               ON sub.homework_id = h.id AND sub.user_id = :uid
             LEFT JOIN public.homework_progress hp
               ON hp.homework_id = h.id AND hp.user_id = :uid
             WHERE h.group_id IS NULL
                OR h.group_id IN (
                    SELECT group_id FROM public.group_memberships
                    WHERE user_id = :uid2 AND is_active = true
                )
             ORDER BY h.due_at NULLS LAST, h.created_at DESC'
        );
        $stmt->execute(['uid' => $userId, 'uid2' => $userId]);
        $items = $stmt->fetchAll() ?: [];
        if ($items === []) return [];

        $ids = array_values(array_filter(array_map(static fn($row) => (string)($row['id'] ?? ''), $items)));
        $attachmentsByHomework = [];
        if ($ids) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $a = $this->db->prepare(
                "SELECT ha.homework_id, ha.file_id, ha.attachment_type, ha.caption, ha.sort_order,
                        ha.inline_view, f.original_name, f.mime_type, f.size_bytes, f.object_key
                 FROM public.homework_attachments ha
                 JOIN public.files f ON f.id = ha.file_id
                 WHERE ha.homework_id IN ($ph) AND f.status <> 'deleted'
                 ORDER BY ha.homework_id, ha.sort_order, ha.created_at"
            );
            $a->execute($ids);
            $b2 = new B2Storage();
            foreach (($a->fetchAll() ?: []) as $row) {
                $item = [
                    'file_id' => (string)$row['file_id'],
                    'name' => $row['original_name'],
                    'mime_type' => $row['mime_type'],
                    'size_bytes' => $row['size_bytes'] !== null ? (int)$row['size_bytes'] : null,
                    'attachment_type' => $row['attachment_type'],
                    'caption' => $row['caption'],
                    'inline_view' => (bool)$row['inline_view'],
                    'download_url' => null,
                ];
                if ($b2->isConfigured() && !empty($row['object_key'])) {
                    try {
                        $item['download_url'] = $b2->presignedDownloadUrl((string)$row['object_key'], 3600);
                    } catch (\Throwable $e) {
                        // Keep metadata visible even if B2 signing temporarily fails.
                    }
                }
                $attachmentsByHomework[(string)$row['homework_id']][] = $item;
            }
        }

        foreach ($items as &$item) {
            $item['attachments'] = $attachmentsByHomework[(string)$item['id']] ?? [];
        }
        unset($item);
        return $items;
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM public.homeworks WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function submit(string $homeworkId, string $userId, ?string $textAnswer, ?string $fileId): array
    {
        $stmt = $this->db->prepare(
            "INSERT INTO public.homework_submissions
                (homework_id, user_id, text_answer, file_id, status, submitted_at)
             VALUES (:hid, :uid, :text, :fid, 'submitted', now())
             ON CONFLICT (homework_id, user_id) DO UPDATE SET
                text_answer = EXCLUDED.text_answer,
                file_id = COALESCE(EXCLUDED.file_id, public.homework_submissions.file_id),
                status = 'submitted',
                submitted_at = now()
             RETURNING *"
        );
        $stmt->execute(['hid' => $homeworkId, 'uid' => $userId, 'text' => $textAnswer, 'fid' => $fileId]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new \RuntimeException('Submit failed');
        }
        return $row;
    }

    public function grade(string $submissionId, float $grade, ?string $comment): ?array
    {
        $stmt = $this->db->prepare(
            "UPDATE public.homework_submissions SET grade = :grade, teacher_comment = :comment, status = 'graded'
             WHERE id = :id RETURNING *"
        );
        $stmt->execute(['grade' => $grade, 'comment' => $comment, 'id' => $submissionId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function create(string $title, ?string $description, ?string $subjectId, ?string $groupId, ?string $dueAt, string $createdBy): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO public.homeworks (title, description, subject_id, group_id, due_at, created_by)
             VALUES (:title, :descr, :sid, :gid, :due, :by) RETURNING *'
        );
        $stmt->execute(['title' => $title, 'descr' => $description, 'sid' => $subjectId, 'gid' => $groupId, 'due' => $dueAt, 'by' => $createdBy]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new \RuntimeException('Create homework failed');
        }
        return $row;
    }
}
