<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Support\ContentStore;
use Medbiohim\Services\SpecialtyAccess;

return static function (Router $router): void {
    $listLocal = static function (?string $subjectId = null): array {
        $out = [];
        foreach ((new ContentStore())->listTestsLocal() as $t) {
            if (!is_array($t)) continue;
            if (isset($t['is_published']) && !$t['is_published']) continue;
            if ($subjectId && ($t['subject_id'] ?? '') !== $subjectId && ($t['subject'] ?? '') !== $subjectId) continue;
            $out[] = [
                'id' => (string) ($t['id'] ?? ''),
                'title' => (string) ($t['title'] ?? 'Тест'),
                'description' => $t['description'] ?? null,
                'subject_name' => $t['subject'] ?? ($t['subject_name'] ?? null),
                'subject_id' => $t['subject_id'] ?? null,
                'questions_count' => isset($t['questions']) && is_array($t['questions']) ? count($t['questions']) : (int) ($t['questionCount'] ?? 0),
                'type' => $t['type'] ?? 'test',
                'source' => 'local-fallback',
            ];
        }
        return $out;
    };

    $findLocal = static function (string $id): ?array {
        foreach ((new ContentStore())->listTestsLocal() as $t) {
            if (is_array($t) && (string) ($t['id'] ?? '') === $id) return $t;
        }
        return null;
    };

    $findTest = static function (string $id) use ($findLocal): array {
        try {
            $db = (new TestRepository())->findById($id);
            if ($db !== null) return ['source' => 'db', 'test' => $db];
        } catch (\Throwable $e) {
            // fall through to local store
        }
        $local = $findLocal($id);
        return $local === null ? ['source' => 'missing', 'test' => null] : ['source' => 'local-fallback', 'test' => $local];
    };

    $router->get('/api/v1/tests', static function (Request $req, array $params) use ($listLocal): void {
        if (!RequireAuth::handle($req)) return;
        $subjectId = isset($req->query['subject_id']) ? (string) $req->query['subject_id'] : null;
        try {
            $items = (new TestRepository())->listPublished($subjectId);
            $access = new SpecialtyAccess();
            $items = array_values(array_filter($items, static function (array $row) use ($access, $req): bool {
                $sid = trim((string) ($row['subject_id'] ?? ''));
                return $sid === '' || $access->canAccessSubject($req->user->id, $sid);
            }));
            foreach ($items as &$row) $row['source'] = 'db';
            unset($row);
            Response::success(['items' => $items, 'source' => 'db'], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => $listLocal($subjectId), 'source' => 'local-fallback'], $req->requestId);
        }
    });

    $router->get('/api/v1/tests/{id}', static function (Request $req, array $params) use ($findTest): void {
        if (!RequireAuth::handle($req)) return;
        $found = $findTest($params['id']);
        if ($found['source'] === 'missing' || !is_array($found['test'])) {
            Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404);
            return;
        }
        if ($found['source'] === 'db') {
            try {
                $test = $found['test'];
                $subjectId = (string) ($test['subject_id'] ?? '');
                if ($subjectId !== '' && !(new SpecialtyAccess())->canAccessSubject($req->user->id, $subjectId)) {
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
                $q->execute(['test_id' => (string) $params['id']]);
                $questions = $q->fetchAll() ?: [];
                Response::success(['test' => $test, 'questions' => $questions, 'source' => 'db'], $req->requestId);
                return;
            } catch (\Throwable $e) {
                Response::error('DB_ERROR', 'Test could not be loaded', $req->requestId, 500);
                return;
            }
        }
        $local = $found['test'];
        $questions = [];
        if (!empty($local['questions']) && is_array($local['questions'])) {
            foreach ($local['questions'] as $i => $q) {
                if (!is_array($q)) continue;
                $questions[] = ['id' => 'lq-' . $i, 'body' => $q['q'] ?? ($q['body'] ?? ''), 'options' => $q['options'] ?? []];
            }
        }
        Response::success([
            'test' => ['id' => $local['id'], 'title' => $local['title'] ?? 'Тест', 'subject_name' => $local['subject'] ?? null, 'source' => 'local-fallback'],
            'questions' => $questions,
            'answers_local' => array_map(static fn($q) => is_array($q) ? ($q['answer'] ?? null) : null, $local['questions'] ?? []),
        ], $req->requestId);
    });

    $start = static function (Request $req, string $testId, callable $findTest): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $test = (new TestRepository())->findById($testId);
            if ($test !== null) {
                $attempt = (new TestRepository())->startAttempt($testId, $req->user->id);
                Response::success(['attempt' => array_merge($attempt, ['source' => 'db'])], $req->requestId, 201);
                return;
            }
        } catch (\Throwable $e) {
            // local fallback below
        }
        $local = $findTest($testId);
        if ($local['source'] !== 'local-fallback') {
            Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404);
            return;
        }
        Response::success(['attempt' => ['id' => 'local-' . bin2hex(random_bytes(6)), 'test_id' => $testId, 'status' => 'in_progress', 'source' => 'local-fallback']], $req->requestId, 201);
    };

    $router->post('/api/v1/tests/{id}/start', static function (Request $req, array $params) use ($start, $findTest): void {
        $start($req, $params['id'], $findTest);
    });

    $router->post('/api/v1/tests/{id}/attempts', static function (Request $req, array $params) use ($start, $findTest): void {
        $start($req, $params['id'], $findTest);
    });

    $router->post('/api/v1/tests/attempts/{id}/finish', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $score = $req->json('score');
        $maxScore = $req->json('max_score');
        if (str_starts_with($params['id'], 'local-')) {
            Response::success(['attempt' => ['id' => $params['id'], 'status' => 'submitted', 'score' => is_numeric($score) ? (float) $score : null, 'max_score' => is_numeric($maxScore) ? (float) $maxScore : null, 'source' => 'local-fallback']], $req->requestId);
            return;
        }
        try {
            $row = (new TestRepository())->finishAttempt($params['id'], $req->user->id, is_numeric($score) ? (float) $score : null, is_numeric($maxScore) ? (float) $maxScore : null);
            if ($row === null) { Response::error('NOT_FOUND', 'Attempt not found', $req->requestId, 404); return; }
            Response::success(['attempt' => $row], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not finish attempt', $req->requestId, 500);
        }
    });

    $router->get('/api/v1/my/attempts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new TestRepository())->attemptsForUser($req->user->id), 'source' => 'db'], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => [], 'source' => 'db-error'], $req->requestId);
        }
    });
};
