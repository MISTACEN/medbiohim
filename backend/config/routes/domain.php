<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\GroupRepository;
use Medbiohim\Repositories\SubjectRepository;
use Medbiohim\Services\SupabaseRest;
use Medbiohim\Services\SpecialtyAccess;

return static function (Router $router): void {
    $router->get('/api/v1/groups', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new GroupRepository())->listActive()], $req->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success(['items' => SupabaseRest::listGroups()], $req->requestId);
            } catch (\Throwable $fallback) {
                \Medbiohim\Support\Logger::error('groups_list_failed', [
                    'requestId' => $req->requestId,
                    'db' => $e->getMessage(),
                    'fallback' => $fallback->getMessage(),
                ]);
                Response::error('DB_UNAVAILABLE', 'Database is not available. Set DB_URL to Supabase Session pooler on SpaceWeb.', $req->requestId, 503);
            }
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

    $router->get('/api/v1/subjects', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $course = isset($req->query['course']) ? (int) $req->query['course'] : null;
        $semester = isset($req->query['semester']) ? (int) $req->query['semester'] : null;
        $filterSubjects = static function (array $items) use ($req): array {
            $access = new SpecialtyAccess();
            $membershipCache = [];
            return array_values(array_filter($items, static function (array $item) use ($access, $req, &$membershipCache): bool {
                $subjectSlug = trim((string) ($item['slug'] ?? ''));
                $specialty = trim((string) ($item['specialty_slug'] ?? ''));
                $requiredSpecialty = ($subjectSlug === 'histology' || $specialty === 'mbh') ? 'mbh' : $specialty;
                if ($requiredSpecialty === '') return true;
                if (!array_key_exists($requiredSpecialty, $membershipCache)) {
                    $membershipCache[$requiredSpecialty] = $access->userHasSpecialty($req->user->id, $requiredSpecialty);
                }
                return $membershipCache[$requiredSpecialty];
            }));
        };

        try {
            $items = (new SubjectRepository())->listActive($course, $semester);
            Response::success(['items' => $filterSubjects($items)], $req->requestId);
        } catch (\Throwable $e) {
            try {
                $items = SupabaseRest::listSubjects($course, $semester);
                Response::success(['items' => $filterSubjects(is_array($items) ? $items : [])], $req->requestId);
            } catch (\Throwable $fallback) {
                \Medbiohim\Support\Logger::error('subjects_list_soft_empty', [
                    'requestId' => $req->requestId,
                    'db' => $e->getMessage(),
                    'fallback' => $fallback->getMessage(),
                ]);
                Response::success([
                    'items' => [],
                    'note' => 'Database unavailable — set DB_URL (Session pooler) on SpaceWeb',
                ], $req->requestId);
            }
        }
    });

    $router->get('/api/v1/subjects/{id}/gradebook', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $subjectId = trim((string) ($params['id'] ?? ''));
        if ($subjectId === '') {
            Response::error('VALIDATION_ERROR', 'subject id is required', $req->requestId, 422);
            return;
        }
        try {
            $canAccessSubject = (new SpecialtyAccess())->canAccessSubject($req->user->id, $subjectId);
        } catch (\Throwable $accessError) {
            \Medbiohim\Support\Logger::error('subject_gradebook_access_check_failed', [
                'requestId' => $req->requestId,
                'message' => $accessError->getMessage(),
            ]);
            Response::error('DB_UNAVAILABLE', 'Subject access could not be verified', $req->requestId, 503);
            return;
        }
        if (!$canAccessSubject) {
            Response::error('FORBIDDEN', 'Этот предмет недоступен для вашей специальности', $req->requestId, 403);
            return;
        }
        try {
            Response::success([
                'items' => SupabaseRest::subjectGradebook($subjectId),
            ], $req->requestId);
        } catch (\Throwable $e) {
            Response::error(
                'DB_UNAVAILABLE',
                'Не удалось загрузить данные для зачётки',
                $req->requestId,
                503
            );
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
