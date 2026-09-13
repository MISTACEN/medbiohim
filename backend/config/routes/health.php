<?php
declare(strict_types=1);

use Medbiohim\Health\HealthChecker;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Support\Env;

return static function (Router $router): void {
    $healthHandler = static function (Request $req, array $params): void {
        $data = (new HealthChecker())->check();
        $status = $data['status'] === 'unhealthy' ? 503 : 200;
        Response::success($data, $req->requestId, $status);
    };
    $router->get('/health', $healthHandler);
    $router->get('/api/v1/health', $healthHandler);
    $router->get('/api/v1', static function (Request $req, array $params): void {
        Response::success([
            'name' => 'MEDBIOHIM API',
            'version' => 'v1',
            'phase' => 'D',
            'endpoints' => ['auth, me, groups, subjects, tests, homeworks, files'],
        ], $req->requestId);
    });
    $router->get('/api/v1/ping', static function (Request $req, array $params): void {
        Response::success(['pong' => true, 'env' => Env::get('APP_ENV', 'local'), 'time' => date('c')], $req->requestId);
    });
};
