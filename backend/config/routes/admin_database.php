<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\AdminDatabaseManager;

return static function (Router $router): void {
    $gate = static function (Request $req): bool {
        return RequireAuth::handle($req) && RequireRole::handle($req, ['admin']);
    };
    $manager = static fn(): AdminDatabaseManager => new AdminDatabaseManager();

    $router->get('/api/v1/admin/database/connections', static function (Request $req) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            Response::success(['items' => $manager()->listConnections()], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_MANAGER_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->put('/api/v1/admin/database/connections/{id}', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            $id = trim((string)($params['id'] ?? ''));
            if ($id === 'supabase_primary') {
                Response::error('FORBIDDEN', 'Основное подключение Supabase настраивается через server-side environment', $req->requestId, 403);
                return;
            }
            $input = is_array($req->jsonBody ?? null) ? $req->jsonBody : [];
            $row = $manager()->saveConnection($input, (string)$req->user->id, $id);
            Response::success(['item' => $row], $req->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('DB_MANAGER_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->post('/api/v1/admin/database/connections/{id}/test', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            Response::success($manager()->test(trim((string)($params['id'] ?? ''))), $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_CONNECTION_FAILED', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/admin/database/{id}/tables', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            Response::success(['items' => $manager()->tables(trim((string)($params['id'] ?? '')))], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_TABLES_FAILED', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/admin/database/{id}/schema/{table}', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            Response::success($manager()->schema(
                trim((string)($params['id'] ?? '')),
                trim((string)($params['table'] ?? ''))
            ), $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_SCHEMA_FAILED', $e->getMessage(), $req->requestId, 422);
        }
    });

    $router->get('/api/v1/admin/database/{id}/rows/{table}', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            $limit = min(500, max(1, (int)($req->query['limit'] ?? 100)));
            $offset = max(0, (int)($req->query['offset'] ?? 0));
            $q = isset($req->query['q']) ? trim((string)$req->query['q']) : null;
            Response::success($manager()->rows(
                trim((string)($params['id'] ?? '')),
                trim((string)($params['table'] ?? '')),
                $limit,
                $offset,
                $q !== '' ? $q : null
            ), $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ROWS_FAILED', $e->getMessage(), $req->requestId, 422);
        }
    });

    $router->post('/api/v1/admin/database/{id}/rows/{table}', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            $row = is_array($req->jsonBody ?? null) ? $req->jsonBody : [];
            Response::success($manager()->insert(
                trim((string)($params['id'] ?? '')),
                trim((string)($params['table'] ?? '')),
                $row
            ), $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('DB_INSERT_FAILED', $e->getMessage(), $req->requestId, 422);
        }
    });

    $router->patch('/api/v1/admin/database/{id}/rows/{table}', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            $payload = is_array($req->jsonBody ?? null) ? $req->jsonBody : [];
            $key = is_array($payload['key'] ?? null) ? $payload['key'] : [];
            $row = is_array($payload['row'] ?? null) ? $payload['row'] : [];
            Response::success($manager()->update(
                trim((string)($params['id'] ?? '')),
                trim((string)($params['table'] ?? '')),
                $key,
                $row
            ), $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UPDATE_FAILED', $e->getMessage(), $req->requestId, 422);
        }
    });

    $router->delete('/api/v1/admin/database/{id}/rows/{table}', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            $payload = is_array($req->jsonBody ?? null) ? $req->jsonBody : [];
            $key = is_array($payload['key'] ?? null) ? $payload['key'] : [];
            Response::success($manager()->delete(
                trim((string)($params['id'] ?? '')),
                trim((string)($params['table'] ?? '')),
                $key
            ), $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_DELETE_FAILED', $e->getMessage(), $req->requestId, 422);
        }
    });

    $router->post('/api/v1/admin/database/{id}/sql', static function (Request $req, array $params) use ($gate, $manager): void {
        if (!$gate($req)) return;
        try {
            $payload = is_array($req->jsonBody ?? null) ? $req->jsonBody : [];
            $sql = (string)($payload['sql'] ?? '');
            $confirmed = (bool)($payload['confirmed'] ?? false);
            Response::success($manager()->executeSql(
                trim((string)($params['id'] ?? '')),
                $sql,
                $confirmed
            ), $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_SQL_FAILED', $e->getMessage(), $req->requestId, 422);
        }
    });
};
