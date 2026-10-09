<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SrsService;

return static function (Router $router): void {
    $uid = static function (Request $req): string {
        return (string) ($req->user->id ?? 'anon');
    };

    $router->get('/api/v1/srs/summary', static function (Request $req, array $params) use ($uid): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        Response::success((new SrsService())->summary($uid($req)), $req->requestId);
    });

    $router->post('/api/v1/srs/ensure', static function (Request $req, array $params) use ($uid): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $add = (int) ($req->json('count') ?? 20);
        $subjectId = $req->json('subject_id');
        $subjectId = is_string($subjectId) && $subjectId !== '' ? $subjectId : null;
        $slug = $req->json('subject_slug');
        $slug = is_string($slug) && $slug !== '' ? $slug : null;
        $out = (new SrsService())->ensureDeck($uid($req), max(1, min(50, $add)), $subjectId, $slug);
        Response::success($out, $req->requestId);
    });

    $router->get('/api/v1/srs/due', static function (Request $req, array $params) use ($uid): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $limit = (int) ($req->query['limit'] ?? 20);
        $subjectId = isset($req->query['subject_id']) ? trim((string)$req->query['subject_id']) : null;
        if ($subjectId === '') $subjectId = null;
        $slug = isset($req->query['subject_slug']) ? (string) $req->query['subject_slug'] : null;
        if ($slug === '') $slug = null;
        $scope = isset($req->query['scope']) ? trim((string) $req->query['scope']) : null;
        $items = (new SrsService())->dueCards($uid($req), max(1, min(50, $limit)), $subjectId, $slug, $scope);
        Response::success(['items' => $items, 'count' => count($items)], $req->requestId);
    });

    $router->get('/api/v1/srs/cards', static function (Request $req, array $params) use ($uid): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $limit = (int) ($req->query['limit'] ?? 100);
        $subjectId = isset($req->query['subject_id']) ? trim((string) $req->query['subject_id']) : null;
        if ($subjectId === '') $subjectId = null;
        $slug = isset($req->query['subject_slug']) ? (string) $req->query['subject_slug'] : null;
        if ($slug === '') {
            $slug = null;
        }
        $scope = isset($req->query['scope']) ? trim((string) $req->query['scope']) : null;
        $items = (new SrsService())->listCards($uid($req), max(1, min(200, $limit)), $subjectId, $slug, $scope);
        Response::success(['items' => $items, 'count' => count($items)], $req->requestId);
    });

    $router->post('/api/v1/srs/cards', static function (Request $req, array $params) use ($uid): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $payload = $req->jsonBody ?? [];
        if (!is_array($payload)) {
            $payload = [];
        }
        try {
            $card = (new SrsService())->addCard($uid($req), $payload);
            Response::success(['card' => $card], $req->requestId, 201);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('srs_route_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('SRS_ERROR', 'Повторение временно недоступно', $req->requestId, 500);
        }
    });

    $router->post('/api/v1/srs/review', static function (Request $req, array $params) use ($uid): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $cardId = trim((string) ($req->json('card_id') ?? $req->json('id') ?? ''));
        $rating = (int) ($req->json('rating') ?? 0);
        if ($cardId === '') {
            Response::error('VALIDATION_ERROR', 'card_id обязателен', $req->requestId, 422);
            return;
        }
        try {
            $out = (new SrsService())->review($uid($req), $cardId, $rating);
            Response::success($out, $req->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('srs_route_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('SRS_ERROR', 'Повторение временно недоступно', $req->requestId, 500);
        }
    });

    $router->delete('/api/v1/srs/cards/{id}', static function (Request $req, array $params) use ($uid): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $id = (string) ($params['id'] ?? '');
        $ok = (new SrsService())->removeCard($uid($req), $id);
        if (!$ok) {
            Response::error('NOT_FOUND', 'Карточка не найдена', $req->requestId, 404);
            return;
        }
        Response::success(['deleted' => true], $req->requestId);
    });
};
