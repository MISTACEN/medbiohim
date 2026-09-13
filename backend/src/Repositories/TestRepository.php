<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use PDO;

final class TestRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function listPublished(?string $subjectId = null): array
    {
        $sql = 'SELECT t.id, t.title, t.description, t.time_limit_sec, t.is_published,
                       t.subject_id, s.name AS subject_name, t.created_at
                FROM public.tests t
                LEFT JOIN public.subjects s ON s.id = t.subject_id
                WHERE t.is_published = true';
        $params = [];
        if ($subjectId !== null && $subjectId !== '') {
            $sql .= ' AND t.subject_id = :sid';
            $params['sid'] = $subjectId;
        }
        $sql .= ' ORDER BY t.created_at DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*, s.name AS subject_name FROM public.tests t
             LEFT JOIN public.subjects s ON s.id = t.subject_id WHERE t.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function questionsForSubject(?string $subjectId, int $limit = 20): array
    {
        $sql = 'SELECT id, subject_id, topic_id, body, difficulty FROM public.questions WHERE is_active = true';
        $params = [];
        if ($subjectId) {
            $sql .= ' AND subject_id = :sid';
            $params['sid'] = $subjectId;
        }
        $sql .= ' ORDER BY random() LIMIT :lim';
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue('lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll() ?: [];
    }

    public function startAttempt(string $testId, string $userId): array
    {
        $stmt = $this->db->prepare(
            "INSERT INTO public.test_attempts (test_id, user_id, status) VALUES (:tid, :uid, 'in_progress') RETURNING *"
        );
        $stmt->execute(['tid' => $testId, 'uid' => $userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new \RuntimeException('Failed to start attempt');
        }
        return $row;
    }

    public function finishAttempt(string $attemptId, string $userId, ?float $score, ?float $maxScore): ?array
    {
        $stmt = $this->db->prepare(
            "UPDATE public.test_attempts SET score = :score, max_score = :max_score, finished_at = now(), status = 'finished'
             WHERE id = :id AND user_id = :uid RETURNING *"
        );
        $stmt->execute(['score' => $score, 'max_score' => $maxScore, 'id' => $attemptId, 'uid' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function attemptsForUser(string $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT a.*, t.title AS test_title FROM public.test_attempts a
             JOIN public.tests t ON t.id = a.test_id WHERE a.user_id = :uid
             ORDER BY a.started_at DESC LIMIT 50'
        );
        $stmt->execute(['uid' => $userId]);
        return $stmt->fetchAll() ?: [];
    }
}
