<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SearchService;

return static function (Router $router): void {
    $router->get('/api/v1/search', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $q = trim((string) ($req->query['q'] ?? $req->query['query'] ?? ''));
        $limit = (int) ($req->query['limit'] ?? 30);
        $subject = isset($req->query['subject_slug']) ? (string) $req->query['subject_slug'] : null;
        $subjectId = isset($req->query['subject_id']) ? (string) $req->query['subject_id'] : null;
        $type = isset($req->query['type']) ? (string) $req->query['type'] : null;
        if ($subject === '') {
            $subject = null;
        }
        if ($subjectId === '') {
            $subjectId = null;
        }
        if ($type === '') {
            $type = null;
        }
        try {
            $out = (new SearchService())->search($q, $limit, $subject, $type, $subjectId);
            Response::success($out, $req->requestId);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('search_route_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('SEARCH_ERROR', 'Поиск временно недоступен', $req->requestId, 503);
        }
    });
};
