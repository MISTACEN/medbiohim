<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\HomeworkRepository;

return static function (Router $router): void {
    $router->get('/api/v1/homeworks', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new HomeworkRepository())->listForUser($req->user->id)], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });

    $router->post('/api/v1/homeworks', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $title = trim((string) $req->json('title', ''));
        if ($title === '') {
            Response::error('VALIDATION_ERROR', 'title is required', $req->requestId, 422);
            return;
        }
        try {
            $row = (new HomeworkRepository())->create(
                $title,
                $req->json('description') !== null ? (string) $req->json('description') : null,
                $req->json('subject_id') ? (string) $req->json('subject_id') : null,
                $req->json('group_id') ? (string) $req->json('group_id') : null,
                $req->json('due_at') ? (string) $req->json('due_at') : null,
                $req->user->id
            );
            Response::success($row, $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not create homework', $req->requestId, 500);
        }
    });

    $router->post('/api/v1/homeworks/{id}/submit', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $hw = (new HomeworkRepository())->findById($params['id']);
            if ($hw === null) {
                Response::error('NOT_FOUND', 'Homework not found', $req->requestId, 404);
                return;
            }
            $text = $req->json('text_answer');
            $fileId = $req->json('file_id');
            $row = (new HomeworkRepository())->submit(
                $params['id'],
                $req->user->id,
                $text !== null ? (string) $text : null,
                $fileId !== null ? (string) $fileId : null
            );
            Response::success(['submission' => $row], $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not submit homework', $req->requestId, 500);
        }
    });

    $router->post('/api/v1/submissions/{id}/grade', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $grade = $req->json('grade');
        if (!is_numeric($grade)) {
            Response::error('VALIDATION_ERROR', 'grade is required', $req->requestId, 422);
            return;
        }
        try {
            $row = (new HomeworkRepository())->grade(
                $params['id'],
                (float) $grade,
                $req->json('comment') !== null ? (string) $req->json('comment') : null
            );
            if ($row === null) {
                Response::error('NOT_FOUND', 'Submission not found', $req->requestId, 404);
                return;
            }
            Response::success(['submission' => $row], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not grade', $req->requestId, 500);
        }
    });
};
