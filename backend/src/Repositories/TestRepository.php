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
        $sql = "SELECT t.id, t.title, t.time_limit_sec, t.is_published,
                       t.subject_id, t.module_id, t.topic_id,
                       s.name AS subject_name, t.created_at,
                       (SELECT COUNT(*) FROM public.test_questions tq WHERE tq.test_id = t.id) AS questions_count,
                       cs.title AS source_title, cs.file_id AS source_file_id,
                       f.original_name AS source_file_name, f.object_key AS source_object_key
                FROM public.tests t
                LEFT JOIN public.subjects s ON s.id = t.subject_id
                LEFT JOIN public.content_sources cs ON cs.id = t.source_key
                LEFT JOIN public.files f ON f.id = cs.file_id AND f.status = 'active'
                WHERE t.is_published = true";
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

    public function findById(string $id, bool $publishedOnly = true): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT t.*, s.name AS subject_name,
                    cs.title AS source_title, cs.file_id AS source_file_id,
                    f.original_name AS source_file_name, f.object_key AS source_object_key
             FROM public.tests t
             LEFT JOIN public.subjects s ON s.id = t.subject_id
             LEFT JOIN public.content_sources cs ON cs.id = t.source_key
             LEFT JOIN public.files f ON f.id = cs.file_id AND f.status = 'active'
             WHERE (t.id::text = :id
               OR t.source_key = :id
               OR t.source_key = :local_source_key)
               AND (:published_only = false OR t.is_published = true)
             LIMIT 1"
        );
        $stmt->execute([
            'id' => $id,
            'local_source_key' => 'local:' . $id,
            'published_only' => $publishedOnly,
        ]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Return public question fields using the current questions schema. */
    public function questionsForSubject(?string $subjectId, int $limit = 20): array
    {
        $sql = 'SELECT id, subject_id, module_id, topic_id,
                       text AS body, options, difficulty, type
                  FROM public.questions
                 WHERE is_published = true';
        $params = [];
        if ($subjectId) {
            $sql .= ' AND subject_id = :sid';
            $params['sid'] = $subjectId;
        }
        $sql .= ' ORDER BY random() LIMIT :lim';
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue('lim', max(1, $limit), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll() ?: [];
    }

    public function startAttempt(string $testId, string $userId): array
    {
        $existing = $this->db->prepare(
            "SELECT * FROM public.test_attempts
             WHERE test_id = :tid AND user_id = :uid AND status = 'in_progress'
             ORDER BY started_at DESC LIMIT 1"
        );
        $existing->execute(['tid'=>$testId,'uid'=>$userId]);
        $active = $existing->fetch();
        if ($active !== false) return $active;

        $stmt = $this->db->prepare(
            "INSERT INTO public.test_attempts (test_id, user_id, status)
             VALUES (:tid, :uid, 'in_progress') RETURNING *"
        );
        try {
            $stmt->execute(['tid' => $testId, 'uid' => $userId]);
        } catch (\PDOException $e) {
            // A concurrent retry may win the partial unique index; return that active attempt.
            if ($e->getCode() !== '23505') throw $e;
            $existing->execute(['tid'=>$testId,'uid'=>$userId]);
            $active=$existing->fetch();
            if($active!==false) return $active;
            throw $e;
        }
        $row = $stmt->fetch();
        if ($row === false) throw new \RuntimeException('Failed to start attempt');
        return $row;
    }

    public function finishAttempt(string $attemptId, string $userId, ?float $score, ?float $maxScore): ?array
    {
        if ($score !== null && $score < 0) throw new \InvalidArgumentException('score must be non-negative');
        if ($maxScore !== null && $maxScore <= 0) throw new \InvalidArgumentException('max_score must be positive');
        if ($score !== null && $maxScore !== null && $score > $maxScore) {
            throw new \InvalidArgumentException('score cannot exceed max_score');
        }

        $this->db->beginTransaction();
        try {
            $lock=$this->db->prepare('SELECT * FROM public.test_attempts WHERE id=:id AND user_id=:uid FOR UPDATE');
            $lock->execute(['id'=>$attemptId,'uid'=>$userId]);
            $existing=$lock->fetch();
            if($existing===false){$this->db->commit();return null;}

            $existingStatus=(string)$existing['status'];
            if($existingStatus!=='in_progress'){
                $sameScore=($score===null && $existing['score']===null) || ($score!==null && $existing['score']!==null && (float)$existing['score']===$score);
                $sameMax=($maxScore===null && $existing['max_score']===null) || ($maxScore!==null && $existing['max_score']!==null && (float)$existing['max_score']===$maxScore);
                if($existingStatus==='submitted' && $sameScore && $sameMax){$this->db->commit();return $existing;}
                throw new \RuntimeException('ATTEMPT_ALREADY_FINISHED');
            }

            $percent = ($score !== null && $maxScore !== null)
                ? round(($score / $maxScore) * 100, 2)
                : null;
            $stmt=$this->db->prepare("UPDATE public.test_attempts
                SET score=:score,max_score=:max_score,percent=:percent,finished_at=now(),status='submitted'
                WHERE id=:id AND user_id=:uid AND status='in_progress' RETURNING *");
            $stmt->execute(['score'=>$score,'max_score'=>$maxScore,'percent'=>$percent,'id'=>$attemptId,'uid'=>$userId]);
            $row=$stmt->fetch();
            if($row===false) throw new \RuntimeException('Failed to finish attempt');
            $this->db->commit();
            return $row;
        } catch(\Throwable $e){
            if($this->db->inTransaction())$this->db->rollBack();
            throw $e;
        }
    }

    public function attemptsForUser(string $userId, ?string $subjectId = null): array
    {
        $sql = 'SELECT a.*, t.title AS test_title, t.subject_id
                  FROM public.test_attempts a
                  JOIN public.tests t ON t.id = a.test_id
                 WHERE a.user_id = :uid';
        $params = ['uid' => $userId];
        if ($subjectId !== null && $subjectId !== '') {
            $sql .= ' AND t.subject_id = :sid';
            $params['sid'] = $subjectId;
        }
        $sql .= ' ORDER BY a.started_at DESC LIMIT 50';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    }
}
