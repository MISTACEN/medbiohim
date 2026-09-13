<?php
declare(strict_types=1);

use Medbiohim\Health\HealthChecker;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
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
            'phase' => 'B',
            'endpoints' => [
                'GET  /api/v1/health',
                'GET  /api/v1',
                'GET  /api/v1/ping',
                'POST /api/v1/auth/login',
                'POST /api/v1/auth/logout',
                'POST /api/v1/auth/refresh',
                'POST /api/v1/auth/recover',
                'GET  /api/v1/auth/me',
            ],
        ], $req->requestId);
    });

    $router->get('/api/v1/ping', static function (Request $req, array $params): void {
        Logger::info('ping', ['requestId' => $req->requestId]);
        Response::success([
            'pong' => true,
            'env' => Env::get('APP_ENV', 'local'),
            'time' => date('c'),
        ], $req->requestId);
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
        Logger::info('auth_login_ok', ['requestId' => $req->requestId]);
        Response::success($result['data'], $req->requestId);
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
        Response::success([
            'sent' => true,
            'message' => 'If the account exists, a recovery email was sent',
        ], $req->requestId);
    });

    $router->get('/api/v1/auth/me', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $user = $req->user;
        Response::success(['user' => $user->toArray()], $req->requestId);
    });
};
