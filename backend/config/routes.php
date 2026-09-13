<?php
declare(strict_types=1);

use Medbiohim\Health\HealthChecker;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\GroupRepository;
use Medbiohim\Repositories\SubjectRepository;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Services\SupabaseAuth;
use Medbiohim\Support\Env;
use Medbiohim\Support\Logger;

return static function (Router $router): void {
    $healthHandler = static function (Request $req, array $params): void {
        $checker = new HealthChecker();
        $data = $checker->check();
        $status = match ($data['status']) {
            'unhealthy' => 503,
            default => 200,
        };
        Response::success($data, $req->requestId, $status);
    };
    $router->get('/health', $healthHandler);
    $router->get('/api/v1/health', $healthHandler);

    $router->get('/api/v1', static function (Request $req, array $params): void {
        Response::success([
            'name' => 'MEDBIOHIM API',
            'version' => 'v1',
            'phase' => 'C',
            'endpoints' => [
                'GET  /api/v1/health',
                'POST /api/v1/auth/login',
                'POST /api/v1/auth/refresh',
                'POST /api/v1/auth/logout',
                'POST /api/v1/auth/recover',
                'GET  /api/v1/auth/me',
                'GET  /api/v1/me',
                'GET  /api/v1/groups',
                'GET  /api/v1/groups/{id}',
                'GET  /api/v1/subjects',
                'GET  /api/v1/subjects/{id}',
            ],
        ], $req->requestId);
    });

    $router->get('/api/v1/ping', static function (Request $req, array $params): void {
        Response::success(['pong' => true, 'env' => Env::get('APP_ENV', 'local'), 'time' => date('c')], $req->requestId);
    });

    $router->post('/api/v1/auth/login', static function (Request $req, array $params): void {
        $email = trim((string) $req->json('email', ''));
        $password = (string) $req->json('password', '');
        if ($email === '' || $password === '') {
            Response::error('VALIDATION_ERROR', 'email and password are required', $req->requestId, 422);
            return;
        }
        $auth = new SupabaseAuth();
        $result = $auth->login($email, $password);
        if (!$result['ok']) {
            Response::error($result['code'], $result['message'], $req->requestId, $result['status']);
            return;
        }
        $data = $result['data'];
        $userId = $data['user']['id'] ?? null;
        $userEmail = $data['user']['email'] ?? $email;
        if (is_string($userId) && $userId !== '') {
            try {
                $repo = new UserRepository();
                $profile = $repo->ensureProfile($userId, (string) $userEmail);
                $data['profile'] = ['id' => $profile['id'], 'full_name' => $profile['full_name'], 'email' => $profile['email']];
                $data['roles'] = $repo->roleCodesForUser($userId);
            } catch (\Throwable $e) {
                Logger::info('profile_sync_skipped', ['requestId' => $req->requestId]);
            }
        }
        Logger::info('auth_login_ok', ['requestId' => $req->requestId]);
        Response::success($data, $req->requestId);
    });

    $router->post('/api/v1/auth/refresh', static function (Request $req, array $params): void {
        $refresh = (string) $req->json('refresh_token', '');
        if ($refresh === '') {
            Response::error('VALIDATION_ERROR', 'refresh_token is required', $req->requestId, 422);
            return;
        }
        $auth = new SupabaseAuth();
        $result = $auth->refresh($refresh);
        if (!$result['ok']) {
            Response::error($result['code'], $result['message'], $req->requestId, $result['status']);
            return;
        }
        Response::success($result['data'], $req->requestId);
    });

    $router->post('/api/v1/auth/logout', static function (Request $req, array $params): void {
        $token = $req->bearerToken() ?? (string) $req->json('access_token', '');
        if ($token === '') {
            Response::error('VALIDATION_ERROR', 'Bearer token or access_token body required', $req->requestId, 422);
            return;
        }
        $auth = new SupabaseAuth();
        $result = $auth->logout($token);
        if (!$result['ok']) {
            Response::error($result['code'], $result['message'], $req->requestId, $result['status']);
            return;
        }
        Response::success(['logged_out' => true], $req->requestId);
    });

    $router->post('/api/v1/auth/recover', static function (Request $req, array $params): void {
        $email = trim((string) $req->json('email', ''));
        if ($email === '') {
            Response::error('VALIDATION_ERROR', 'email is required', $req->requestId, 422);
            return;
        }
        $auth = new SupabaseAuth();
        $result = $auth->recover($email);
        if (!$result['ok']) {
            Response::error($result['code'], $result['message'], $req->requestId, $result['status']);
            return;
        }
        Response::success(['sent' => true, 'message' => 'If the account exists, a recovery email was sent'], $req->requestId);
    });

    $router->get('/api/v1/auth/me', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        Response::success(['user' => $req->user->toArray()], $req->requestId);
    });

    $router->get('/api/v1/me', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
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
        if (!RequireAuth::handle($req)) {
            return;
        }
        try {
            $repo = new GroupRepository();
            Response::success(['items' => $repo->listActive()], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/groups/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
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

    $router->get('/api/v1/subjects', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $course = isset($req->query['course']) ? (int) $req->query['course'] : null;
        $semester = isset($req->query['semester']) ? (int) $req->query['semester'] : null;
        try {
            $repo = new SubjectRepository();
            Response::success(['items' => $repo->listActive($course, $semester)], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/subjects/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        try {
            $repo = new SubjectRepository();
            $detail = $repo->detailWithModules($params['id']);
            if ($detail === null) {
                Response::error('NOT_FOUND', 'Subject not found', $req->requestId, 404);
                return;
            }
            Response::success($detail, $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });
};
