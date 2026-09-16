<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SupabaseAcademic;
use Medbiohim\Support\ContentStore;

return static function (Router $r): void {
    $r->get('/api/v1/community/posts', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        try {
            Response::success(['items' => SupabaseAcademic::communityPosts()], $q->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success([
                    'items' => (new ContentStore())->listCommunityPosts(),
                    'note' => 'local_store',
                ], $q->requestId);
            } catch (\Throwable $x) {
                Response::success(['items' => [], 'note' => 'community unavailable'], $q->requestId);
            }
        }
    });

    $r->post('/api/v1/community/posts', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $title = trim((string) $q->json('title', ''));
        $body = trim((string) $q->json('body', ''));
        if ($title === '' || $body === '') {
            Response::error('VALIDATION_ERROR', 'title and body required', $q->requestId, 422);
            return;
        }
        try {
            $row = SupabaseAcademic::createCommunityPost($q->user->id, $title, $body);
            Response::success(['post' => $row], $q->requestId, 201);
        } catch (\Throwable $e) {
            try {
                $name = $q->user->email ?? 'Студент';
                $row = (new ContentStore())->createCommunityPost([
                    'title' => $title,
                    'body' => $body,
                    'author_id' => $q->user->id,
                    'author_name' => is_string($name) ? $name : 'Студент',
                ]);
                Response::success(['post' => $row, 'note' => 'local_store'], $q->requestId, 201);
            } catch (\Throwable $x) {
                Response::error('DB_ERROR', 'Не удалось создать публикацию', $q->requestId, 500);
            }
        }
    });
};
