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
        try {
            if ($subjectId !== null && $subjectId !== '') {
                (new AcademicContextResolver())->resolveForRequest($req->user->id, null, $subjectId);
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

    $router->get('/api/v1/tests/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $test = (new TestRepository())->findById((string) $params['id']);
            if ($test === null) { Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404); return; }
            $sid = (string) ($test['subject_id'] ?? '');
            if ($sid !== '') {
                (new AcademicContextResolver())->resolveForRequest($req->user->id, null, $sid);
            }
            if ($sid !== '' && !(new SpecialtyAccess())->canAccessSubject($req->user->id, $sid)) {
                Response::error('FORBIDDEN', 'Этот тест недоступен для вашей специальности', $req->requestId, 403);
                return;
            }
            $db = \Medbiohim\Database\Connection::pdo();
            $q = $db->prepare(
                'SELECT q.id, q.subject_id, q.module_id, q.topic_id, q.type, q.text, q.answer, q.options, q.difficulty
                 FROM public.test_questions tq
                 JOIN public.questions q ON q.id = tq.question_id
                 WHERE tq.test_id = :test_id
                   AND q.is_published = true
                   AND q.archived_at IS NULL
                 ORDER BY tq.order_index, q.id'
            );
            $q->execute(['test_id' => (string) $test['id']]);
            Response::success(['test' => $test, 'questions' => $q->fetchAll() ?: [], 'source' => 'db'], $req->requestId);
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
            if ($sid !== '' && !(new SpecialtyAccess())->canAccessSubject($req->user->id, $sid)) {
                Response::error('FORBIDDEN', 'Этот тест недоступен для вашей специальности', $req->requestId, 403);
                return;
            }
            $attempt = (new TestRepository())->startAttempt((string) $test['id'], $req->user->id);
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

    $router->post('/api/v1/tests/attempts/{id}/finish', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $score = $req->json('score');
        $maxScore = $req->json('max_score');
        try {
            $row = (new TestRepository())->finishAttempt((string) $params['id'], $req->user->id, is_numeric($score) ? (float) $score : null, is_numeric($maxScore) ? (float) $maxScore : null);
            if ($row === null) { Response::error('NOT_FOUND', 'Attempt not found', $req->requestId, 404); return; }
            Response::success(['attempt' => $row], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Не удалось завершить попытку', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/my/attempts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new TestRepository())->attemptsForUser($req->user->id), 'source' => 'db'], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'История попыток временно недоступна', $req->requestId, 503);
        }
    });
};
