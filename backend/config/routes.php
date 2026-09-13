<?php
declare(strict_types=1);

use Medbiohim\Health\HealthChecker;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
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
            'phase' => 'A',
            'endpoints' => [
                'GET /api/v1/health',
                'GET /api/v1',
                'GET /api/v1/ping',
            ],
            'note' => 'Auth and domain endpoints arrive in Phase B+',
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
};
