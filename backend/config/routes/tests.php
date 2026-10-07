<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Services\SpecialtyAccess;
use Medbiohim\Services\AcademicContextResolver;
use Medbiohim\Services\AcademicContextException;

return static function (Router $router): void {
    $router->get('/api/v1/tests', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $subjectId = isset($req->query['subject_id']) ? (string) $req->query['subject_id'] : null;
        $groupId = isset($req->query['group_id']) ? trim((string) $req->query['group_id']) : null;
        if ($groupId === '') $groupId = null;
        try {
            if ($subjectId !== null && $subjectId !== '') {
                (new AcademicContextResolver())->resolveForRequest($req->user->id, $groupId, $subjectId);
            }
            $items = (new TestRepository())->listPublished($subjectId);
            $access = new SpecialtyAccess();
            $items = array_values(array_filter($items, static function (array $row) use ($access, $req): bool {
                $sid = trim((string) ($row['subject_id'] ?? ''));
                return $sid === '' || $access->canAccessSubject($req->user->id, $sid);
            }));
            foreach ($items as &$row) $row['source'] = 'db';
            unset($row);
            Response::success(['items' => $items, 'source' => 'db'], $req->requestId);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $req->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Тесты временно недоступны: база данных не отвечает', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/tests/curriculum-map', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $subjectId = isset($req->query['subject_id']) ? trim((string)$req->query['subject_id']) : null;
            if ($subjectId === '') $subjectId = null;
            $groupId = isset($req->query['group_id']) ? trim((string)$req->query['group_id']) : null;
            if ($groupId === '') $groupId = null;
            $resolver = new AcademicContextResolver();
            $group = $resolver->requireGroup($req->user->id, $groupId);
            if ($subjectId !== null) $resolver->resolveForRequest($req->user->id, (string)$group['group_id'], $subjectId);
            $map = (new TestRepository())->curriculumMap(
                $subjectId,
                isset($group['course']) ? (int)$group['course'] : null,
                isset($group['semester']) ? (int)$group['semester'] : null,
                isset($group['specialty_slug']) ? (string)$group['specialty_slug'] : null
            );
            Response::success(['items'=>$map, 'group'=>$group, 'source'=>'db'], $req->requestId);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $req->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'План тем временно недоступен', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/tests/chemistry-master', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $page = max(1, (int)($req->query['page'] ?? 1));
            $limit = min(50, max(1, (int)($req->query['limit'] ?? 20)));
            $kind = trim((string)($req->query['kind'] ?? ''));
            $formula = trim((string)($req->query['formula'] ?? ''));
            $search = trim((string)($req->query['q'] ?? ''));
            $pdo = \Medbiohim\Database\Connection::pdo();
            $where = ["d.subject_slug = 'chemistry_organic_physical'", "d.version = '2026-10-07-v1'"];
            $paramsSql = [];
            if ($kind !== '') { $where[] = "item->>'kind' = :kind"; $paramsSql['kind'] = $kind; }
            if ($formula !== '') { $where[] = "COALESCE(item->>'formula_preserved','false') = :formula"; $paramsSql['formula'] = $formula === '1' || strtolower($formula) === 'true' ? 'true' : 'false'; }
            if ($search !== '') {
                $where[] = "(item->>'question' ILIKE :search OR COALESCE(item->>'topic','') ILIKE :search)";
                $paramsSql['search'] = '%' . $search . '%';
            }
            $whereSql = implode(' AND ', $where);
            $count = $pdo->prepare("SELECT count(*) FROM public.chemistry_master_documents d CROSS JOIN LATERAL jsonb_array_elements(d.content) item WHERE {$whereSql}");
            $count->execute($paramsSql);
            $total = (int)$count->fetchColumn();
            $offset = ($page - 1) * $limit;
            $sql = "SELECT
                        item->>'id' AS item_id,
                        item->>'kind' AS kind,
                        item->>'topic' AS topic,
                        item->>'question' AS question,
                        item->>'answer' AS answer,
                        item->>'source' AS source,
                        item->>'answer_status' AS answer_status,
                        item->>'source_number' AS source_number,
                        item->>'formula_preserved' AS formula_preserved,
                        item->>'plan_topic_id' AS plan_topic_id
                    FROM public.chemistry_master_documents d
                    CROSS JOIN LATERAL jsonb_array_elements(d.content) item
                    WHERE {$whereSql}
                    ORDER BY (item->>'source_number')::int NULLS LAST, item->>'id'
                    LIMIT :limit OFFSET :offset";
            $stmt = $pdo->prepare($sql);
            foreach ($paramsSql as $key => $value) $stmt->bindValue(':' . $key, $value);
            $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
            $stmt->execute();
            $items = $stmt->fetchAll() ?: [];
            foreach ($items as &$item) $item['formula_preserved'] = ($item['formula_preserved'] ?? 'false') === 'true';
            unset($item);
            Response::success([
                'items' => $items,
                'pagination' => ['page'=>$page,'limit'=>$limit,'total'=>$total,'pages'=>$limit > 0 ? (int)ceil($total/$limit) : 1],
                'source' => 'chemistry_master_documents'
            ], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Единый банк химии временно недоступен', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/tests/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $test = (new TestRepository())->findById((string) $params['id']);
            if ($test === null) { Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404); return; }
            $sid = (string) ($test['subject_id'] ?? '');
            $groupId = isset($req->query['group_id']) ? trim((string) $req->query['group_id']) : null;
            if ($groupId === '') $groupId = null;
            if ($sid !== '') {
                (new AcademicContextResolver())->resolveForRequest($req->user->id, $groupId, $sid);
            }
            if ($sid !== '' && !(new SpecialtyAccess())->canAccessSubject($req->user->id, $sid)) {
                Response::error('FORBIDDEN', 'Этот тест недоступен для вашей специальности', $req->requestId, 403);
                return;
            }
            $db = \Medbiohim\Database\Connection::pdo();
            $q = $db->prepare(
                'SELECT q.id, q.subject_id, q.module_id, q.topic_id, q.type, q.text, q.options, q.difficulty,
                        m.title AS module_title, tp.title AS topic_title
                 FROM public.test_questions tq
                 JOIN public.questions q ON q.id = tq.question_id
                 LEFT JOIN public.modules m ON m.id = q.module_id
                 LEFT JOIN public.topics tp ON tp.id = q.topic_id
                 WHERE tq.test_id = :test_id
                   AND q.is_published = true
                   AND q.archived_at IS NULL
                 ORDER BY tq.order_index, q.id'
            );
            $q->execute(['test_id' => (string) $test['id']]);
            $questions=$q->fetchAll() ?: [];
            foreach($questions as &$question){
                $opts=is_string($question['options']??null)?(json_decode($question['options'],true)?:[]):($question['options']??[]);
                $clean=[];$correctCount=0;
                foreach(is_array($opts)?$opts:[] as $opt){
                    if(is_array($opt)){ if(!empty($opt['correct'])) $correctCount++; $clean[]=['label'=>(string)($opt['label']??'')]; }
                    else $clean[]=['label'=>(string)$opt];
                }
                $question['options']=$clean;
                $question['allow_multiple']=$correctCount>1;
            }
            unset($question);
            Response::success(['test' => $test, 'questions' => $questions, 'source' => 'db'], $req->requestId);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $req->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Тест временно недоступен', $req->requestId, 503);
        }
    });

    $start = static function (Request $req, string $testId): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $test = (new TestRepository())->findById($testId);
            if ($test === null) { Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404); return; }
            $sid = (string) ($test['subject_id'] ?? '');
            $groupId = isset($req->query['group_id']) ? trim((string) $req->query['group_id']) : null;
            if ($groupId === '') $groupId = null;
            if ($sid !== '') {
                (new AcademicContextResolver())->resolveForRequest($req->user->id, $groupId, $sid);
            }
            if ($sid !== '' && !(new SpecialtyAccess())->canAccessSubject($req->user->id, $sid)) {
                Response::error('FORBIDDEN', 'Этот тест недоступен для вашей специальности', $req->requestId, 403);
                return;
            }
            $context=(new AcademicContextResolver())->resolveForRequest($req->user->id,$groupId,$sid!==''?$sid:null);
            $attempt = (new TestRepository())->startAttempt((string) $test['id'], $req->user->id, $context);
            unset($attempt['question_snapshot']);
            Response::success(['attempt' => array_merge($attempt, ['source' => 'db'])], $req->requestId, 201);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $req->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Не удалось начать тест', $req->requestId, 503);
        }
    };

    $router->post('/api/v1/tests/{id}/start', static function (Request $req, array $params) use ($start): void {
        $start($req, (string) $params['id']);
    });

    $router->post('/api/v1/tests/{id}/attempts', static function (Request $req, array $params) use ($start): void {
        $start($req, (string) $params['id']);
    });

    $router->post('/api/v1/tests/attempts/{id}/answers', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $questionId=trim((string)$req->json('question_id',''));
            if($questionId===''){ Response::error('VALIDATION_ERROR','question_id обязателен',$req->requestId,422); return; }
            $raw=$req->json('answer_text');
            $answer=$raw===null?null:(string)$raw;
            $row=(new TestRepository())->saveAnswer((string)$params['id'],$req->user->id,$questionId,$answer);
            Response::success(['answer'=>$row],$req->requestId);
        } catch(\RuntimeException $e) {
            $code=$e->getMessage();
            $status=$code==='ATTEMPT_NOT_FOUND'?404:409;
            Response::error($code,$code==='QUESTION_NOT_IN_ATTEMPT'?'Вопрос не входит в эту попытку':$code,$req->requestId,$status);
        } catch(\Throwable $e) {
            Response::error('ANSWER_SAVE_ERROR','Не удалось сохранить ответ',$req->requestId,503);
        }
    });

    $router->post('/api/v1/tests/attempts/{id}/answers/{questionId}/regrade', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $row = (new TestRepository())->retryAnswerGrading(
                (string) $params['id'],
                $req->user->id,
                (string) $params['questionId']
            );
            Response::success(['answer'=>$row], $req->requestId);
        } catch (RuntimeException $e) {
            $code = $e->getMessage();
            $status = in_array($code, ['ATTEMPT_NOT_FOUND','ANSWER_NOT_FOUND'], true) ? 404 : 409;
            Response::error($code, $code === 'QUESTION_NOT_IN_ATTEMPT' ? 'Вопрос не входит в эту попытку' : $code, $req->requestId, $status);
        } catch (Throwable $e) {
            Response::error('GRADING_RETRY_ERROR', 'Не удалось повторно проверить ответ', $req->requestId, 503);
        }
    });

    $router->post('/api/v1/tests/attempts/{id}/finish', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        // Score is calculated server-side from persisted answers and the attempt snapshot.
        try {
            $row = (new TestRepository())->finishAttempt((string) $params['id'], $req->user->id);
            if ($row === null) { Response::error('NOT_FOUND', 'Attempt not found', $req->requestId, 404); return; }
            unset($row['question_snapshot']);
            Response::success(['attempt' => $row], $req->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\RuntimeException $e) {
            if ($e->getMessage() === 'ATTEMPT_ALREADY_FINISHED') {
                Response::error('ATTEMPT_ALREADY_FINISHED', 'Попытка уже завершена; изменять её результат нельзя', $req->requestId, 409);
                return;
            }
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 503);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Не удалось завершить попытку', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/my/attempts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $groupId = isset($req->query['group_id']) ? trim((string)$req->query['group_id']) : null;
            if ($groupId === '') $groupId = null;
            $subjectId = isset($req->query['subject_id']) ? trim((string)$req->query['subject_id']) : null;
            if ($subjectId === '') $subjectId = null;
            $resolver = new AcademicContextResolver();
            $group = $resolver->requireGroup($req->user->id,$groupId);
            if ($subjectId !== null) $resolver->resolveForRequest($req->user->id,(string)$group['group_id'],$subjectId);
            Response::success([
                'items' => (new TestRepository())->attemptsForUser($req->user->id,$subjectId,(string)$group['group_id']),
                'source' => 'db',
                'group' => $group,
            ], $req->requestId);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode,$e->getMessage(),$req->requestId,$e->httpStatus,$e->details);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'История попыток временно недоступна', $req->requestId, 503);
        }
    });
};
