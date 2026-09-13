<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
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
            'SELECT h.id, h.title, h.description, h.due_at, h.subject_id, h.group_id,
                    s.name AS subject_name,
                    sub.id AS submission_id, sub.status AS submission_status,
                    sub.grade, sub.submitted_at
             FROM public.homeworks h
             LEFT JOIN public.subjects s ON s.id = h.subject_id
             LEFT JOIN public.homework_submissions sub
               ON sub.homework_id = h.id AND sub.user_id = :uid
             WHERE h.group_id IS NULL
                OR h.group_id IN (
                    SELECT group_id FROM public.group_memberships
                    WHERE user_id = :uid2 AND is_active = true
                )
             ORDER BY h.due_at NULLS LAST, h.created_at DESC'
        );
        $stmt->execute(['uid' => $userId, 'uid2' => $userId]);
        return $stmt->fetchAll() ?: [];
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
