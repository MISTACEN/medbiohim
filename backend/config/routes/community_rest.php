<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SupabaseAcademic;
use Medbiohim\Services\AcademicContextResolver;
use Medbiohim\Services\AcademicContextException;
use Medbiohim\Support\ContentStore;

return static function (Router $r): void {
    $r->get('/api/v1/community/posts', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        try {
            $groupId = isset($q->query['group_id']) ? trim((string)$q->query['group_id']) : null;
            $group = (new AcademicContextResolver())->requireGroup($q->user->id, $groupId);
            Response::success(['items' => SupabaseAcademic::communityPosts(100, (string)$group['group_id']), 'group_id' => $group['group_id']], $q->requestId);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $q->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            try {
                Response::success([
                    'items' => (new ContentStore())->listCommunityPosts(),
                    'source' => 'supabase_rest_fallback',
                ], $q->requestId);
            } catch (\Throwable $x) {
                Response::error('DB_UNAVAILABLE', 'Community is temporarily unavailable.', $q->requestId, 503);
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
            $requestedGroup = $q->json('group_id') !== null ? trim((string)$q->json('group_id')) : null;
            $group = (new AcademicContextResolver())->requireGroup($q->user->id, $requestedGroup);
            $row = SupabaseAcademic::createCommunityPost($q->user->id, $title, $body, (string)$group['group_id']);
            Response::success(['post' => $row], $q->requestId, 201);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $q->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            try {
                $name = $q->user->email ?? 'Студент';
                $row = (new ContentStore())->createCommunityPost([
                    'title' => $title,
                    'body' => $body,
                    'author_id' => $q->user->id,
                    'group_id' => (string)$group['group_id'],
                    'author_name' => is_string($name) ? $name : 'Студент',
                ]);
                Response::success(['post' => $row, 'note' => 'local_store'], $q->requestId, 201);
            } catch (\Throwable $x) {
                Response::error('DB_ERROR', 'Не удалось создать публикацию', $q->requestId, 500);
            }
        }
    });
};
