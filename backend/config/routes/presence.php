<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\PresenceService;

return static function (Router $router): void {
    $router->post('/api/v1/presence/heartbeat', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $u = $req->user;
            $raw = is_array($u->raw ?? null) ? $u->raw : [];
            $name = $raw['user_metadata']['full_name'] ?? $raw['full_name'] ?? $raw['name'] ?? null;
            $row = (new PresenceService())->heartbeat([
                'id' => (string) $u->id,
                'email' => (string) ($u->email ?? ''),
                'name' => is_string($name) ? $name : null,
                'role' => $u->role ?? null,
            ]);
            Response::success(['presence' => $row], $req->requestId);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('presence_route_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('PRESENCE_ERROR', 'Не удалось обновить статус присутствия', $req->requestId, 500);
        }
    });

    $router->get('/api/v1/admin/presence', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['admin', 'moderator', 'teacher'])) return;
        $within = (int) ($req->query['within'] ?? 180);
        $within = max(60, min($within, 900));
        try {
            $items = (new PresenceService())->listOnline($within);
            Response::success([
                'items' => $items,
                'count' => count($items),
                'within_sec' => $within,
            ], $req->requestId);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('presence_route_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('PRESENCE_ERROR', 'Не удалось обновить статус присутствия', $req->requestId, 500);
        }
    });
};
