<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\GroupRepository;
use Medbiohim\Repositories\SubjectRepository;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Services\SupabaseRest;
use Medbiohim\Services\SupabaseAcademic;

return static function (Router $r): void {
    $r->get('/api/v1/me', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $x = new UserRepository();
            $x->ensureProfile($q->user->id, $q->user->email ?? '');
            Response::success($x->profileBundle($q->user->id), $q->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success(SupabaseRest::profileBundle($q->user->id), $q->requestId);
            } catch (\Throwable $x) {
                Response::success([
                    'user' => $q->user->toArray(),
                    'roles' => $q->user->role ? [$q->user->role] : [],
                    'groups' => [],
                    'course' => null,
                ], $q->requestId);
            }
        }
    });

    $r->get('/api/v1/groups/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $x = new GroupRepository();
            $g = $x->findById($p['id']);
            if ($g === null) {
                Response::error('NOT_FOUND', 'Group not found', $q->requestId, 404);
                return;
            }
            Response::success(['group' => $g, 'members' => $x->members($p['id'])], $q->requestId);
        } catch (\Throwable $e) {
            try {
                $x = SupabaseRest::getGroup($p['id']);
                if ($x === null) {
                    Response::error('NOT_FOUND', 'Group not found', $q->requestId, 404);
                    return;
                }
                Response::success($x, $q->requestId);
            } catch (\Throwable $x) {
                Response::error('DB_UNAVAILABLE', 'Database is not available', $q->requestId, 503);
            }
        }
    });

    $r->post('/api/v1/groups/{id}/members', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['teacher', 'moderator', 'admin'])) return;
        $uid = trim((string) $q->json('user_id', ''));
        if ($uid === '') {
            Response::error('VALIDATION_ERROR', 'user_id is required', $q->requestId, 422);
            return;
        }
        try {
            try {
                $x = (new GroupRepository())->addMember($p['id'], $uid, (string) $q->json('role_in_group', 'student'));
            } catch (\Throwable $e) {
                $x = SupabaseRest::addGroupMember($p['id'], $uid, (string) $q->json('role_in_group', 'student'));
            }
            Response::success($x, $q->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 503);
        }
    });

    $r->get('/api/v1/subjects/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $x = (new SubjectRepository())->detailWithModules($p['id']);
            if ($x === null) {
                Response::error('NOT_FOUND', 'Subject not found', $q->requestId, 404);
                return;
            }
            Response::success($x, $q->requestId);
        } catch (\Throwable $e) {
            try {
                $x = SupabaseAcademic::subjectDetail($p['id']);
                if ($x === null) {
                    Response::error('NOT_FOUND', 'Subject not found', $q->requestId, 404);
                    return;
                }
                Response::success($x, $q->requestId);
            } catch (\Throwable $x) {
                \Medbiohim\Support\Logger::error('subject_detail_failed', [
                    'requestId' => $q->requestId,
                    'db' => $e->getMessage(),
                    'fallback' => $x->getMessage(),
                ]);
                Response::error('DB_UNAVAILABLE', 'Database is not available', $q->requestId, 503);
            }
        }
    });

    $r->patch('/api/v1/groups/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['teacher', 'moderator', 'admin'])) return;
        try {
            $x = (new GroupRepository())->update($p['id'], $q->jsonBody() ?? []);
            Response::success(['group' => $x], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->delete('/api/v1/groups/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['admin', 'moderator'])) return;
        $hard = !empty($q->query['hard'] ?? null);
        try {
            $ok = $hard
                ? (new GroupRepository())->hardDelete($p['id'])
                : (new GroupRepository())->softDelete($p['id']);
            if (!$ok) {
                Response::error('NOT_FOUND', 'Group not found', $q->requestId, 404);
                return;
            }
            Response::success(['deleted' => true, 'hard' => $hard], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->patch('/api/v1/subjects/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['teacher', 'moderator', 'admin'])) return;
        try {
            $x = (new SubjectRepository())->update($p['id'], $q->jsonBody() ?? []);
            Response::success(['subject' => $x], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->delete('/api/v1/subjects/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['admin', 'moderator'])) return;
        try {
            $ok = (new SubjectRepository())->delete($p['id']);
            if (!$ok) {
                Response::error('NOT_FOUND', 'Subject not found', $q->requestId, 404);
                return;
            }
            Response::success(['deleted' => true], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });
};
