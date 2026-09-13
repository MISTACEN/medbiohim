<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Services\SupabaseAuth;
use Medbiohim\Support\Logger;
use Medbiohim\Support\RateLimiter;

return static function (Router $router): void {
    $router->post('/api/v1/auth/login', static function (Request $req, array $params): void {
        $ip = RateLimiter::clientIp();
        $limit = RateLimiter::attempt('login:' . $ip, 10, 300);
        if (!$limit['allowed']) {
            Response::error('RATE_LIMITED', 'Too many login attempts. Try again later.', $req->requestId, 429, ['retry_after' => $limit['retry_after']]);
            return;
        }
        $email = trim((string) $req->json('email', ''));
        $password = (string) $req->json('password', '');
        if ($email === '' || $password === '') {
            Response::error('VALIDATION_ERROR', 'email and password are required', $req->requestId, 422);
            return;
        }
        $result = (new SupabaseAuth())->login($email, $password);
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
        Response::success($data, $req->requestId);
    });

    $router->post('/api/v1/auth/refresh', static function (Request $req, array $params): void {
        $refresh = (string) $req->json('refresh_token', '');
        if ($refresh === '') {
            Response::error('VALIDATION_ERROR', 'refresh_token is required', $req->requestId, 422);
            return;
        }
        $result = (new SupabaseAuth())->refresh($refresh);
        if (!$result['ok']) {
            Response::error($result['code'], $result['message'], $req->requestId, $result['status']);
            return;
        }
        Response::success($result['data'], $req->requestId);
    });

    $router->post('/api/v1/auth/logout', static function (Request $req, array $params): void {
        $token = $req->bearerToken() ?? (string) $req->json('access_token', '');
        if ($token === '') {
            Response::error('VALIDATION_ERROR', 'Bearer token or access_token required', $req->requestId, 422);
            return;
        }
        $result = (new SupabaseAuth())->logout($token);
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
        $result = (new SupabaseAuth())->recover($email);
        if (!$result['ok']) {
            Response::error($result['code'], $result['message'], $req->requestId, $result['status']);
            return;
        }
        Response::success(['sent' => true], $req->requestId);
    });

    $router->get('/api/v1/auth/me', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        Response::success(['user' => $req->user->toArray()], $req->requestId);
    });
};
