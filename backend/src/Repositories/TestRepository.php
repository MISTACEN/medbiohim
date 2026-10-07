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
                       m.title AS module_title, tp.title AS topic_title,
                       m.order_index AS module_order, tp.order_index AS topic_order,
                       s.name AS subject_name, t.created_at,
                       (SELECT COUNT(*) FROM public.test_questions tq WHERE tq.test_id = t.id) AS questions_count,
                       cs.title AS source_title, cs.file_id AS source_file_id,
                       f.original_name AS source_file_name, f.object_key AS source_object_key
                FROM public.tests t
                LEFT JOIN public.subjects s ON s.id = t.subject_id
                LEFT JOIN public.modules m ON m.id = t.module_id
                LEFT JOIN public.topics tp ON tp.id = t.topic_id
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

    /** Build the lesson/topic map used by the tests UI. Never guesses a topic for an untagged question. */
    public function curriculumMap(?string $subjectId = null, ?int $course = null, ?int $semester = null, ?string $specialtySlug = null): array
    {
        $sql = "SELECT s.id AS subject_id, s.name AS subject_name,
                       m.id AS module_id, m.title AS module_title, m.order_index AS module_order,
                       tp.id AS topic_id, tp.title AS topic_title, tp.order_index AS topic_order,
                       ci.planned_date AS planned_date,
                       ci.item_type AS curriculum_item_type,
                       (SELECT COUNT(*) FROM public.questions q
                          WHERE q.topic_id = tp.id AND q.is_published = true AND q.archived_at IS NULL) AS question_count,
                       (SELECT COUNT(DISTINCT t.id) FROM public.tests t
                          WHERE t.topic_id = tp.id AND t.is_published = true AND t.archived_at IS NULL) AS test_count
                FROM public.modules m
                JOIN public.subjects s ON s.id = m.subject_id AND s.is_active = true
                JOIN public.topics tp ON tp.module_id = m.id AND tp.is_published = true
                LEFT JOIN LATERAL (
                    SELECT cix.planned_date, cix.item_type
                    FROM public.curriculum_items cix
                    WHERE cix.topic_id = tp.id
                      AND cix.is_active = true
                    ORDER BY cix.planned_date NULLS LAST, cix.order_index, cix.updated_at DESC
                    LIMIT 1
                ) ci ON true
                WHERE 1=1";
        $params = [];
        if ($subjectId !== null && $subjectId !== '') {
            $sql .= ' AND s.id = :sid';
            $params['sid'] = $subjectId;
        }
        if ($course !== null) {
            $sql .= ' AND s.course_number = :course';
            $params['course'] = $course;
        }
        if ($semester !== null) {
            $sql .= ' AND s.semester = :semester';
            $params['semester'] = $semester;
        }
        if ($specialtySlug !== null && $specialtySlug !== '') {
            $sql .= ' AND (s.specialty_slug = :specialty OR s.specialty_slug IS NULL)';
            $params['specialty'] = $specialtySlug;
        }
        $sql .= ' ORDER BY s.name, planned_date NULLS LAST, m.order_index, tp.order_index, tp.title';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll() ?: [];

        $subjects = [];
        foreach ($rows as $row) {
            $sid = (string)$row['subject_id'];
            if (!isset($subjects[$sid])) {
                $unc = $this->db->prepare("SELECT COUNT(*) FROM public.questions q WHERE q.subject_id=:sid AND q.is_published=true AND q.archived_at IS NULL AND q.topic_id IS NULL");
                $unc->execute(['sid'=>$sid]);
                $subjects[$sid] = [
                    'subject_id'=>$sid,
                    'subject_name'=>(string)$row['subject_name'],
                    'unclassified_questions'=>(int)$unc->fetchColumn(),
                    'modules'=>[]
                ];
            }
            $mid=(string)$row['module_id'];
            if (!isset($subjects[$sid]['modules'][$mid])) {
                $subjects[$sid]['modules'][$mid]=[
                    'module_id'=>$mid,
                    'title'=>(string)$row['module_title'],
                    'order_index'=>(int)$row['module_order'],
                    'topics'=>[]
                ];
            }
            $subjects[$sid]['modules'][$mid]['topics'][]=[
                'topic_id'=>(string)$row['topic_id'],
                'title'=>(string)$row['topic_title'],
                'order_index'=>(int)$row['topic_order'],
                'question_count'=>(int)$row['question_count'],
                'test_count'=>(int)$row['test_count'],
                'planned_date'=>$row['planned_date'] ?? null,
                'curriculum_item_type'=>$row['curriculum_item_type'] ?? null,
                'is_extra'=>str_contains(mb_strtolower((string)$row['module_title']), 'вне текущего плана') || (($row['curriculum_item_type'] ?? null) === 'other'),
            ];
        }
        return array_values(array_map(static function(array $subject): array {
            $subject['modules']=array_values($subject['modules']);
            return $subject;
        }, $subjects));
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

    public function retryAnswerGrading(string $attemptId, string $userId, string $questionId): array
    {
        $q = $this->db->prepare("SELECT * FROM public.test_attempts WHERE id=:id AND user_id=:uid");
        $q->execute(['id'=>$attemptId,'uid'=>$userId]);
        $attempt = $q->fetch();
        if ($attempt === false) throw new RuntimeException('ATTEMPT_NOT_FOUND');

        $answerQ = $this->db->prepare("SELECT * FROM public.test_answers WHERE attempt_id=:aid AND question_id=:qid");
        $answerQ->execute(['aid'=>$attemptId,'qid'=>$questionId]);
        $answer = $answerQ->fetch();
        if ($answer === false) throw new RuntimeException('ANSWER_NOT_FOUND');
        if (!in_array((string)($answer['grading_status'] ?? ''), ['pending','error'], true)) {
            return $answer;
        }

        $snapshot = is_string($attempt['question_snapshot'] ?? null)
            ? (json_decode($attempt['question_snapshot'], true) ?: [])
            : ($attempt['question_snapshot'] ?? []);
        $question = null;
        foreach (is_array($snapshot) ? $snapshot : [] as $item) {
            if ((string)($item['id'] ?? '') === $questionId) { $question = $item; break; }
        }
        if ($question === null) throw new RuntimeException('QUESTION_NOT_IN_ATTEMPT');

        $grading = AnswerGradingService::grade($question, $answer['answer_text'] ?? null);

        $this->db->beginTransaction();
        try {
            $up = $this->db->prepare(
                "UPDATE public.test_answers
                    SET is_correct=:correct, score=:score, grading_status=:status, grading_source=:source,
                        grading_confidence=:confidence, grading_feedback=:feedback, grading_model=:model,
                        graded_at=:graded_at
                  WHERE attempt_id=:aid AND question_id=:qid
                  RETURNING *"
            );
            $up->execute([
                'correct'=>$grading['is_correct'],'score'=>$grading['score'],
                'status'=>$grading['grading_status'],'source'=>$grading['grading_source'],
                'confidence'=>$grading['confidence'],'feedback'=>$grading['feedback'],'model'=>$grading['model'],
                'graded_at'=>in_array($grading['grading_status'], ['deterministic','ai'], true) ? date('c') : null,
                'aid'=>$attemptId,'qid'=>$questionId,
            ]);
            $updated = $up->fetch();
            if ($updated === false) throw new RuntimeException('ANSWER_NOT_FOUND');

            if ((string)$attempt['status'] === 'submitted') {
                $snapshotCount = is_array($snapshot) ? count($snapshot) : 0;
                $stats = $this->db->prepare("SELECT COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0) AS score FROM public.test_answers WHERE attempt_id=:aid");
                $stats->execute(['aid'=>$attemptId]);
                $score = (float)($stats->fetchColumn() ?? 0);
                $percent = $snapshotCount > 0 ? round(($score / $snapshotCount) * 100, 2) : 0;
                $recalc = $this->db->prepare("UPDATE public.test_attempts SET score=:score, max_score=:max_score, percent=:percent WHERE id=:id AND user_id=:uid");
                $recalc->execute(['score'=>$score,'max_score'=>(float)$snapshotCount,'percent'=>$percent,'id'=>$attemptId,'uid'=>$userId]);
            }

            $this->db->commit();
            return ['question_id'=>$questionId,'answer_text'=>$answer['answer_text']] + $grading;
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
            // AI is optional: pending/error answers do not block completion.
            // They remain visible as unresolved and can be regraded later.
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
