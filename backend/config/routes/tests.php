<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\TestRepository;

return static function (Router $router): void {
    $router->get('/api/v1/tests', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $subjectId = isset($req->query['subject_id']) ? (string) $req->query['subject_id'] : null;
        try {
            Response::success(['items' => (new TestRepository())->listPublished($subjectId)], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/tests/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $repo = new TestRepository();
            $test = $repo->findById($params['id']);
            if ($test === null) {
                Response::error('NOT_FOUND', 'Test not found', $req->requestId, 404);
                return;
            }
            $questions = $repo->questionsForSubject($test['subject_id'] ?? null, 15);
            $safe = array_map(static function ($q) { unset($q['answer_key']); return $q; }, $questions);
            Response::success(['test' => $test, 'questions' => $safe], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });

    $router->post('/api/v1/tests/{id}/attempts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $repo = new TestRepository();
            $test = $repo->findById($params['id']);
            if ($test === null || empty($test['is_published'])) {
                Response::error('NOT_FOUND', 'Test not found or not published', $req->requestId, 404);
                return;
            }
            Response::success(['attempt' => $repo->startAttempt($params['id'], $req->user->id)], $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not start attempt', $req->requestId, 500);
        }
    });

    $router->patch('/api/v1/attempts/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $score = $req->json('score');
        $maxScore = $req->json('max_score');
        try {
            $row = (new TestRepository())->finishAttempt($params['id'], $req->user->id, is_numeric($score) ? (float)$score : null, is_numeric($maxScore) ? (float)$maxScore : null);
            if ($row === null) {
                Response::error('NOT_FOUND', 'Attempt not found', $req->requestId, 404);
                return;
            }
            Response::success(['attempt' => $row], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not finish attempt', $req->requestId, 500);
        }
    });

    $router->get('/api/v1/my/attempts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new TestRepository())->attemptsForUser($req->user->id)], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });
};
