<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Support\ContentStore;

return static function (Router $router): void {
    $mergeLocal = static function (?string $subjectId = null): array {
        $local = (new ContentStore())->listTestsLocal();
        $out = [];
        foreach ($local as $t) {
            if (!is_array($t)) continue;
            if (isset($t['is_published']) && !$t['is_published']) continue;
            if ($subjectId && ($t['subject_id'] ?? '') !== $subjectId && ($t['subject'] ?? '') !== $subjectId) continue;
            $out[] = [
                'id' => (string) ($t['id'] ?? ''),
                'title' => (string) ($t['title'] ?? 'Тест'),
                'description' => $t['description'] ?? null,
                'subject_name' => $t['subject'] ?? ($t['subject_name'] ?? null),
                'subject_id' => $t['subject_id'] ?? null,
                'questions_count' => isset($t['questions']) && is_array($t['questions'])
                    ? count($t['questions'])
                    : (int) ($t['questionCount'] ?? 0),
                'type' => $t['type'] ?? 'test',
                'source' => 'local',
            ];
        }
        try {
            foreach ((new TestRepository())->listPublished($subjectId) as $row) {
                $row['source'] = 'db';
                $out[] = $row;
            }
        } catch (\Throwable $e) {
        }
        return $out;
    };

    $findLocal = static function (string $id): ?array {
        foreach ((new ContentStore())->listTestsLocal() as $t) {
            if (is_array($t) && (string) ($t['id'] ?? '') === $id) return $t;
        }
        return null;
    };

    $router->get('/api/v1/tests', static function (Request $req, array $params) use ($mergeLocal): void {
        if (!RequireAuth::handle($req)) return;
        $subjectId = isset($req->query['subject_id']) ? (string) $req->query['subject_id'] : null;
        Response::success(['items' => $mergeLocal($subjectId)], $req->requestId);
    });

    $router->get('/api/v1/tests/{id}', static function (Request $req, array $params) use ($findLocal): void {
        if (!RequireAuth::handle($req)) return;
        $local = $findLocal($params['id']);
        if ($local !== null) {
            $questions = [];
            if (!empty($local['questions']) && is_array($local['questions'])) {
                foreach ($local['questions'] as $i => $q) {
                    if (!is_array($q)) continue;
                    $questions[] = [
                        'id' => 'lq-' . $i,
                        'body' => $q['q'] ?? ($q['body'] ?? ''),
                        'options' => $q['options'] ?? [],
                    ];
                }
            }
            Response::success([
                'test' => [
                    'id' => $local['id'],
                    'title' => $local['title'] ?? 'Тест',
                    'subject_name' => $local['subject'] ?? null,
                    'source' => 'local',
                ],
                'questions' => $questions,
                'answers_local' => array_map(static function ($q) {
                    return is_array($q) ? ($q['answer'] ?? null) : null;
                }, $local['questions'] ?? []),
            ], $req->requestId);
            return;
        }
        try {
            $repo = new TestRepository();
            $test = $repo->findById($params['id']);
            if ($test === null) {
                Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404);
                return;
            }
            $questions = $repo->questionsForSubject($test['subject_id'] ?? null, 15);
            $safe = array_map(static function ($q) {
                unset($q['answer_key']);
                return $q;
            }, $questions);
            Response::success(['test' => $test, 'questions' => $safe], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404);
        }
    });

    $router->post('/api/v1/tests/{id}/start', static function (Request $req, array $params) use ($findLocal): void {
        if (!RequireAuth::handle($req)) return;
        $local = $findLocal($params['id']);
        if ($local !== null) {
            Response::success([
                'attempt' => [
                    'id' => 'local-' . bin2hex(random_bytes(6)),
                    'test_id' => $params['id'],
                    'status' => 'in_progress',
                    'source' => 'local',
                ],
            ], $req->requestId, 201);
            return;
        }
        try {
            $attempt = (new TestRepository())->startAttempt($params['id'], $req->user->id);
            Response::success(['attempt' => $attempt], $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not start attempt', $req->requestId, 500);
        }
    });

    $router->post('/api/v1/tests/{id}/attempts', static function (Request $req, array $params) use ($findLocal): void {
        if (!RequireAuth::handle($req)) return;
        $local = $findLocal($params['id']);
        if ($local !== null) {
            Response::success([
                'attempt' => [
                    'id' => 'local-' . bin2hex(random_bytes(6)),
                    'test_id' => $params['id'],
                    'status' => 'in_progress',
                    'source' => 'local',
                ],
            ], $req->requestId, 201);
            return;
        }
        try {
            $attempt = (new TestRepository())->startAttempt($params['id'], $req->user->id);
            Response::success(['attempt' => $attempt], $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 500);
        }
    });

    $router->post('/api/v1/tests/attempts/{id}/finish', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $score = $req->json('score');
        $maxScore = $req->json('max_score');
        if (str_starts_with($params['id'], 'local-')) {
            Response::success([
                'attempt' => [
                    'id' => $params['id'],
                    'status' => 'finished',
                    'score' => is_numeric($score) ? (float) $score : null,
                    'max_score' => is_numeric($maxScore) ? (float) $maxScore : null,
                ],
            ], $req->requestId);
            return;
        }
        try {
            $row = (new TestRepository())->finishAttempt(
                $params['id'],
                $req->user->id,
                is_numeric($score) ? (float) $score : null,
                is_numeric($maxScore) ? (float) $maxScore : null
            );
            if ($row === null) {
                Response::error('NOT_FOUND', 'Attempt not found', $req->requestId, 404);
                return;
            }
            Response::success(['attempt' => $row], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 500);
        }
    });

    $router->get('/api/v1/my/attempts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new TestRepository())->attemptsForUser($req->user->id)], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => []], $req->requestId);
        }
    });
};
