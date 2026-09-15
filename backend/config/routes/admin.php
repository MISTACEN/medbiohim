<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\GroupRepository;
use Medbiohim\Repositories\SubjectRepository;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Support\ContentStore;
use Medbiohim\Support\Env;

return static function (Router $router): void {
    $adminGate = static function (Request $req): bool {
        if (!RequireAuth::handle($req)) {
            return false;
        }
        return RequireRole::handle($req, ['admin', 'moderator', 'teacher']);
    };

    $strictAdmin = static function (Request $req): bool {
        if (!RequireAuth::handle($req)) {
            return false;
        }
        return RequireRole::handle($req, ['admin']);
    };

    $router->get('/api/v1/site', static function (Request $req, array $params): void {
        $store = new ContentStore();
        Response::success([
            'site' => $store->getSite(),
            'announcements' => $store->listAnnouncements(),
        ], $req->requestId);
    });

    // Claim admin: secret OR first admin bootstrap
    $router->post('/api/v1/admin/claim-admin', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $secret = trim((string) $req->json('secret', ''));
        $expected = Env::get('ADMIN_BOOTSTRAP_SECRET', 'medbiohim-admin-2026');
        $repo = new UserRepository();
        try {
            $repo->ensureProfile($req->user->id, $req->user->email ?? '');
            $adminCount = $repo->countWithRole('admin');
            $okSecret = ($expected !== '' && $secret !== '' && hash_equals($expected, $secret));
            if (!$okSecret && $adminCount > 0) {
                Response::error('FORBIDDEN', 'Admin already exists. Provide correct secret or ask an admin.', $req->requestId, 403);
                return;
            }
            $repo->assignRole($req->user->id, 'admin');
            $roles = $repo->roleCodesForUser($req->user->id);
            Response::success([
                'roles' => $roles,
                'message' => 'Admin role granted',
            ], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', 'Could not assign role (check DB connection): ' . $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/admin/users', static function (Request $req, array $params) use ($strictAdmin): void {
        if (!$strictAdmin($req)) return;
        try {
            Response::success(['items' => (new UserRepository())->listUsers(100)], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->post('/api/v1/admin/users/roles', static function (Request $req, array $params) use ($strictAdmin): void {
        if (!$strictAdmin($req)) return;
        $userId = trim((string) $req->json('user_id', ''));
        $role = trim((string) $req->json('role', ''));
        $action = trim((string) $req->json('action', 'assign'));
        if ($userId === '' || $role === '') {
            Response::error('VALIDATION_ERROR', 'user_id and role required', $req->requestId, 422);
            return;
        }
        if (!in_array($role, ['admin', 'moderator', 'teacher', 'student'], true)) {
            Response::error('VALIDATION_ERROR', 'invalid role', $req->requestId, 422);
            return;
        }
        try {
            $repo = new UserRepository();
            if ($action === 'revoke') $repo->revokeRole($userId, $role);
            else $repo->assignRole($userId, $role);
            Response::success(['roles' => $repo->roleCodesForUser($userId)], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/admin/overview', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $store = new ContentStore();
        $groups = $subjects = 0;
        try {
            $groups = count((new GroupRepository())->listActive());
            $subjects = count((new SubjectRepository())->list(null, null));
        } catch (\Throwable $e) {}
        Response::success([
            'site' => $store->getSite(),
            'counts' => [
                'announcements' => count($store->listAnnouncements()),
                'groups' => $groups,
                'subjects' => $subjects,
                'schedule' => count($store->listSchedule()),
                'tests_local' => count($store->listTestsLocal()),
                'curriculum' => count($store->listCurriculum()),
            ],
        ], $req->requestId);
    });

    $router->put('/api/v1/admin/site', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        if (!RequireRole::handle($req, ['admin', 'moderator'])) return;
        $body = $req->jsonBody ?? [];
        $allowed = [];
        foreach (['title', 'subtitle', 'description', 'announcement_banner'] as $k) {
            if (array_key_exists($k, $body)) $allowed[$k] = is_string($body[$k]) ? $body[$k] : (string) $body[$k];
        }
        if (isset($body['contacts']) && is_array($body['contacts'])) $allowed['contacts'] = $body['contacts'];
        $site = (new ContentStore())->updateSite($allowed);
        Response::success(['site' => $site], $req->requestId);
    });

    $router->get('/api/v1/admin/announcements', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        Response::success(['items' => (new ContentStore())->listAnnouncements()], $req->requestId);
    });

    $router->post('/api/v1/admin/announcements', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $title = trim((string) $req->json('title', ''));
        $body = trim((string) $req->json('body', ''));
        if ($title === '' || $body === '') {
            Response::error('VALIDATION_ERROR', 'title and body are required', $req->requestId, 422);
            return;
        }
        $row = (new ContentStore())->createAnnouncement([
            'title' => $title,
            'body' => $body,
            'pinned' => (bool) $req->json('pinned', false),
        ]);
        Response::success(['item' => $row], $req->requestId, 201);
    });

    $router->patch('/api/v1/admin/announcements/{id}', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $patch = [];
        foreach (['title', 'body', 'pinned'] as $k) {
            if ($req->jsonBody !== null && array_key_exists($k, $req->jsonBody)) $patch[$k] = $req->jsonBody[$k];
        }
        $row = (new ContentStore())->updateAnnouncement($params['id'], $patch);
        if ($row === null) {
            Response::error('NOT_FOUND', 'Announcement not found', $req->requestId, 404);
            return;
        }
        Response::success(['item' => $row], $req->requestId);
    });

    $router->delete('/api/v1/admin/announcements/{id}', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $ok = (new ContentStore())->deleteAnnouncement($params['id']);
        if (!$ok) {
            Response::error('NOT_FOUND', 'Announcement not found', $req->requestId, 404);
            return;
        }
        Response::success(['deleted' => true], $req->requestId);
    });

    $router->get('/api/v1/admin/curriculum', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        Response::success(['items' => (new ContentStore())->listCurriculum()], $req->requestId);
    });

    $router->put('/api/v1/admin/curriculum', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $items = $req->json('items');
        if (!is_array($items)) {
            Response::error('VALIDATION_ERROR', 'items array required', $req->requestId, 422);
            return;
        }
        Response::success(['items' => (new ContentStore())->saveCurriculum($items)], $req->requestId);
    });

    $router->get('/api/v1/admin/tests', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $store = new ContentStore();
        $db = [];
        try { $db = (new TestRepository())->listPublished(null); } catch (\Throwable $e) {}
        Response::success(['items' => $store->listTestsLocal(), 'db_items' => $db], $req->requestId);
    });

    $router->put('/api/v1/admin/tests', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $items = $req->json('items');
        if (!is_array($items)) {
            Response::error('VALIDATION_ERROR', 'items array required', $req->requestId, 422);
            return;
        }
        $norm = [];
        foreach ($items as $it) {
            if (!is_array($it)) continue;
            if (empty($it['id'])) $it['id'] = bin2hex(random_bytes(8));
            $norm[] = $it;
        }
        Response::success(['items' => (new ContentStore())->saveTestsLocal($norm)], $req->requestId);
    });

    $router->post('/api/v1/admin/tests/db', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $title = trim((string) $req->json('title', ''));
        if ($title === '') {
            Response::error('VALIDATION_ERROR', 'title required', $req->requestId, 422);
            return;
        }
        try {
            $row = (new TestRepository())->create([
                'title' => $title,
                'description' => (string) $req->json('description', ''),
                'subject_id' => $req->json('subject_id') ?: null,
                'time_limit_sec' => (int) ($req->json('time_limit_sec', 0) ?: 0) ?: null,
                'is_published' => (bool) $req->json('is_published', true),
            ]);
            Response::success(['item' => $row], $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });
};
