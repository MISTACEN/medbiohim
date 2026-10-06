<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use Medbiohim\Services\AnswerGradingService;
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

    public function startAttempt(string $testId, string $userId, ?array $context = null): array
    {
        $existing = $this->db->prepare(
            "SELECT * FROM public.test_attempts
             WHERE test_id = :tid AND user_id = :uid AND status = 'in_progress'
             ORDER BY started_at DESC LIMIT 1"
        );
        $existing->execute(['tid'=>$testId,'uid'=>$userId]);
        $active = $existing->fetch();
        if ($active !== false) return $active;

        $questions = $this->db->prepare(
            "SELECT q.id, q.subject_id, q.module_id, q.topic_id, q.type, q.text, q.answer, q.options
             FROM public.test_questions tq
             JOIN public.questions q ON q.id=tq.question_id
             WHERE tq.test_id=:tid AND q.is_published=true AND q.archived_at IS NULL
             ORDER BY tq.order_index, q.id"
        );
        $questions->execute(['tid'=>$testId]);
        $snapshot = $questions->fetchAll() ?: [];
        $snapshot = array_map(static function(array $q): array {
            return [
                'id'=>(string)$q['id'],
                'subject_id'=>$q['subject_id']??null,
                'module_id'=>$q['module_id']??null,
                'topic_id'=>$q['topic_id']??null,
                'type'=>(string)$q['type'],
                'text'=>(string)$q['text'],
                'answer'=>$q['answer']??null,
                'options'=>is_string($q['options']??null) ? (json_decode($q['options'],true) ?: []) : ($q['options']??[]),
            ];
        }, $snapshot);

        $stmt = $this->db->prepare(
            "INSERT INTO public.test_attempts
                (test_id,user_id,status,group_id,session_id,context_version,question_snapshot)
             VALUES (:tid,:uid,'in_progress',:gid,:sid,:cv,:snapshot) RETURNING *"
        );
        try {
            $stmt->execute([
                'tid'=>$testId,'uid'=>$userId,
                'gid'=>$context['group_id']??null,
                'sid'=>$context['session_id']??null,
                'cv'=>$context['context_version']??null,
                'snapshot'=>json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
            ]);
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


    public function saveAnswer(string $attemptId, string $userId, string $questionId, ?string $answerText): array
    {
        $q = $this->db->prepare("SELECT * FROM public.test_attempts WHERE id=:id AND user_id=:uid");
        $q->execute(['id'=>$attemptId,'uid'=>$userId]);
        $attempt = $q->fetch();
        if ($attempt === false) throw new RuntimeException('ATTEMPT_NOT_FOUND');
        if ((string)$attempt['status'] !== 'in_progress') throw new RuntimeException('ATTEMPT_NOT_IN_PROGRESS');

        $snapshot = is_string($attempt['question_snapshot'] ?? null)
            ? (json_decode($attempt['question_snapshot'], true) ?: [])
            : ($attempt['question_snapshot'] ?? []);
        if (!is_array($snapshot)) $snapshot = [];

        $question = null;
        foreach ($snapshot as $item) {
            if ((string)($item['id'] ?? '') === $questionId) { $question = $item; break; }
        }
        if ($question === null) throw new RuntimeException('QUESTION_NOT_IN_ATTEMPT');

        // AI is deliberately called outside the DB transaction: a slow provider
        // must never hold a row lock while grading an answer.
        $grading = AnswerGradingService::grade($question, $answerText);

        $this->db->beginTransaction();
        try {
            $lock = $this->db->prepare("SELECT status FROM public.test_attempts WHERE id=:id AND user_id=:uid FOR UPDATE");
            $lock->execute(['id'=>$attemptId,'uid'=>$userId]);
            $locked = $lock->fetch();
            if ($locked === false) throw new RuntimeException('ATTEMPT_NOT_FOUND');
            if ((string)$locked['status'] !== 'in_progress') throw new RuntimeException('ATTEMPT_NOT_IN_PROGRESS');

            $up = $this->db->prepare(
                "INSERT INTO public.test_answers
                    (attempt_id,question_id,answer_text,is_correct,score,grading_status,grading_source,grading_confidence,grading_feedback,grading_model,graded_at)
                 VALUES (:aid,:qid,:answer,:correct,:score,:status,:source,:confidence,:feedback,:model,:graded_at)
                 ON CONFLICT(attempt_id,question_id) DO UPDATE SET
                    answer_text=EXCLUDED.answer_text,
                    is_correct=EXCLUDED.is_correct,
                    score=EXCLUDED.score,
                    grading_status=EXCLUDED.grading_status,
                    grading_source=EXCLUDED.grading_source,
                    grading_confidence=EXCLUDED.grading_confidence,
                    grading_feedback=EXCLUDED.grading_feedback,
                    grading_model=EXCLUDED.grading_model,
                    graded_at=EXCLUDED.graded_at"
            );
            $up->execute([
                'aid'=>$attemptId,'qid'=>$questionId,'answer'=>$answerText,
                'correct'=>$grading['is_correct'],'score'=>$grading['score'],
                'status'=>$grading['grading_status'],'source'=>$grading['grading_source'],
                'confidence'=>$grading['confidence'],'feedback'=>$grading['feedback'],'model'=>$grading['model'],
                'graded_at'=>in_array($grading['grading_status'], ['deterministic','ai'], true) ? date('c') : null
            ]);
            $this->db->commit();
            return ['question_id'=>$questionId,'answer_text'=>$answerText] + $grading;
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    public function finishAttempt(string $attemptId, string $userId, ?float $score = null, ?float $maxScore = null): ?array
    {
        $this->db->beginTransaction();
        try {
            $lock=$this->db->prepare('SELECT * FROM public.test_attempts WHERE id=:id AND user_id=:uid FOR UPDATE');
            $lock->execute(['id'=>$attemptId,'uid'=>$userId]);
            $existing=$lock->fetch();
            if($existing===false){$this->db->commit();return null;}

            $existingStatus=(string)$existing['status'];
            if($existingStatus!=='in_progress'){
                if($existingStatus==='submitted'){$this->db->commit();return $existing;}
                throw new RuntimeException('ATTEMPT_ALREADY_FINISHED');
            }

            $snapshot=is_string($existing['question_snapshot']??null)?json_decode($existing['question_snapshot'],true):($existing['question_snapshot']??[]);
            if(!is_array($snapshot))$snapshot=[];
            $pending=$this->db->prepare("SELECT COUNT(*) FROM public.test_answers WHERE attempt_id=:aid AND grading_status IN ('pending','error')");
            $pending->execute(['aid'=>$attemptId]);
            if((int)$pending->fetchColumn()>0){
                $this->db->rollBack();
                throw new RuntimeException('AI_GRADING_PENDING');
            }

            $maxScore=(float)count($snapshot);
            $answered=$this->db->prepare("SELECT COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0) AS score FROM public.test_answers WHERE attempt_id=:aid");
            $answered->execute(['aid'=>$attemptId]);
            $answerStats=$answered->fetch()?:[];
            $score=(float)($answerStats['score']??0);
            $percent=$maxScore>0 ? round(($score/$maxScore)*100,2) : 0;
            $stmt=$this->db->prepare("UPDATE public.test_attempts
                SET score=:score,max_score=:max_score,percent=:percent,finished_at=now(),status='submitted'
                WHERE id=:id AND user_id=:uid AND status='in_progress' RETURNING *");
            $stmt->execute(['score'=>$score,'max_score'=>$maxScore,'percent'=>$percent,'id'=>$attemptId,'uid'=>$userId]);
            $row=$stmt->fetch();
            if($row===false)throw new RuntimeException('Failed to finish attempt');
            $this->db->commit();
            return $row;
        }catch(Throwable $e){
            if($this->db->inTransaction())$this->db->rollBack();
            throw $e;
        }
    }

    public function attemptsForUser(string $userId, ?string $subjectId = null, ?string $groupId = null): array
    {
        $sql = 'SELECT a.id, a.test_id, a.user_id, a.status, a.score, a.max_score,
                         a.percent, a.started_at, a.finished_at, a.group_id, a.session_id,
                         a.context_version, t.title AS test_title, t.subject_id
                  FROM public.test_attempts a
                  JOIN public.tests t ON t.id = a.test_id
                  LEFT JOIN public.subjects s ON s.id = t.subject_id
                 WHERE a.user_id = :uid';
        $params = ['uid' => $userId];
        if ($subjectId !== null && $subjectId !== '') {
            $sql .= ' AND t.subject_id = :sid';
            $params['sid'] = $subjectId;
        }
        if ($groupId !== null && $groupId !== '') {
            // История попыток принадлежит конкретной учебной группе.
            // Не восстанавливаем принадлежность по subject/schedule: один subject может
            // одновременно существовать в нескольких группах.
            $sql .= ' AND a.group_id = :gid';
            $params['gid'] = $groupId;
        }
        $sql .= ' ORDER BY a.started_at DESC LIMIT 50';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    }
}
