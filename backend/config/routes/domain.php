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

return static function (Router $router): void {
    $router->get('/api/v1/me', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $repo = new UserRepository();
            $repo->ensureProfile($req->user->id, $req->user->email);
            Response::success($repo->profileBundle($req->user->id), $req->requestId);
        } catch (\Throwable $e) {
            Response::success([
                'user' => $req->user->toArray(),
                'roles' => $req->user->role ? [$req->user->role] : [],
                'groups' => [],
                'note' => 'Profile DB unavailable — JWT-only',
            ], $req->requestId);
        }
    });

    $router->get('/api/v1/groups', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new GroupRepository())->listActive()], $req->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success(['items' => SupabaseRest::listGroups()], $req->requestId);
            } catch (\Throwable $fallback) {
                \Medbiohim\Support\Logger::error('groups_list_failed', ['requestId'=>$req->requestId, 'db'=>$e->getMessage(), 'fallback'=>$fallback->getMessage()]);
                Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
            }
        }
    });

    $router->get('/api/v1/groups/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $repo = new GroupRepository();
            $group = $repo->findById($params['id']);
            if ($group === null) {
                Response::error('NOT_FOUND', 'Group not found', $req->requestId, 404);
                return;
            }
            Response::success(['group' => $group, 'members' => $repo->members($params['id'])], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });

    $router->post('/api/v1/groups', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $name = trim((string) $req->json('name', ''));
        if ($name === '') {
            Response::error('VALIDATION_ERROR', 'name is required', $req->requestId, 422);
            return;
        }
        try {
            $payload = [
                'name' => $name,
                'code' => $req->json('code'),
                'course_number' => $req->json('course_number'),
                'admission_year' => $req->json('admission_year'),
            ];
            try {
                $row = (new GroupRepository())->create($payload);
            } catch (\Throwable $dbError) {
                $row = SupabaseRest::createGroup($payload);
            }
            Response::success($row, $req->requestId, 201);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('create_group_failed', [
                'requestId' => $req->requestId,
                'message' => $e->getMessage(),
                'code' => $e->getCode(),
            ]);
            Response::error('DB_ERROR', 'Could not create group', $req->requestId, 500);
        }
    });

    $router->post('/api/v1/groups/{id}/members', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $userId = (string) $req->json('user_id', '');
        if ($userId === '') {
            Response::error('VALIDATION_ERROR', 'user_id is required', $req->requestId, 422);
            return;
        }
        try {
            $row = (new GroupRepository())->addMember($params['id'], $userId, (string) $req->json('role_in_group', 'student'));
            Response::success($row, $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not add member', $req->requestId, 500);
        }
    });

    $router->get('/api/v1/subjects', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $course = isset($req->query['course']) ? (int) $req->query['course'] : null;
        $semester = isset($req->query['semester']) ? (int) $req->query['semester'] : null;
        try {
            Response::success(['items' => (new SubjectRepository())->listActive($course, $semester)], $req->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success(['items' => SupabaseRest::listSubjects($course, $semester)], $req->requestId);
            } catch (\Throwable $fallback) {
                \Medbiohim\Support\Logger::error('subjects_list_failed', ['requestId'=>$req->requestId, 'db'=>$e->getMessage(), 'fallback'=>$fallback->getMessage()]);
                Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
            }
        }
    });

    $router->get('/api/v1/subjects/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $detail = (new SubjectRepository())->detailWithModules($params['id']);
            if ($detail === null) {
                Response::error('NOT_FOUND', 'Subject not found', $req->requestId, 404);
                return;
            }
            Response::success($detail, $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });

    $router->post('/api/v1/subjects', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $name = trim((string) $req->json('name', ''));
        if ($name === '') {
            Response::error('VALIDATION_ERROR', 'name is required', $req->requestId, 422);
            return;
        }
        try {
            $payload = [
                'name' => $name,
                'course_number' => $req->json('course_number'),
                'semester' => $req->json('semester'),
                'control_type' => $req->json('control_type'),
                'lecture_hours' => $req->json('lecture_hours'),
                'practice_hours' => $req->json('practice_hours'),
            ];
            try {
                $row = (new SubjectRepository())->create($payload);
            } catch (\Throwable $dbError) {
                $row = SupabaseRest::createSubject($payload);
            }
            Response::success($row, $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not create subject', $req->requestId, 500);
        }
    });
};
// synced 2026-09-15
