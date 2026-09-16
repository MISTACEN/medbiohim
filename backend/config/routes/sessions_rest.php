<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Support\ContentStore;

return static function (Router $r): void {
    $r->get('/api/v1/sessions', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $status = (string) ($q->query['status'] ?? '');
        $items = (new ContentStore())->listSessions($q->user->id);
        if ($status !== '') {
            $items = array_values(array_filter($items, static fn($s) => (string) ($s['status'] ?? '') === $status));
        }
        Response::success(['items' => $items], $q->requestId);
    });

    $r->post('/api/v1/sessions', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $type = (string) $q->json('type', 'practice');
        $refId = (string) $q->json('ref_id', '');
        $title = (string) $q->json('title', 'Сессия');
        $payload = $q->json('payload', []);
        if (!is_array($payload)) {
            $payload = [];
        }
        $session = (new ContentStore())->saveSession([
            'user_id' => $q->user->id,
            'type' => $type,
            'ref_id' => $refId,
            'title' => $title,
            'status' => 'in_progress',
            'current_index' => (int) $q->json('current_index', 0),
            'answers' => is_array($q->json('answers', [])) ? $q->json('answers', []) : [],
            'payload' => $payload,
        ]);
        Response::success(['session' => $session], $q->requestId, 201);
    });

    $r->patch('/api/v1/sessions/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $store = new ContentStore();
        $existing = $store->getSession($q->user->id, (string) ($p['id'] ?? ''));
        if ($existing === null) {
            Response::error('NOT_FOUND', 'Session not found', $q->requestId, 404);
            return;
        }
        $patch = [];
        foreach (['status', 'current_index', 'answers', 'payload', 'title', 'score'] as $key) {
            $v = $q->json($key, null);
            if ($v !== null) {
                $patch[$key] = $v;
            }
        }
        if (isset($patch['status']) && $patch['status'] === 'finished') {
            $patch['finished_at'] = gmdate('c');
        }
        $session = $store->saveSession(array_merge($existing, $patch));
        Response::success(['session' => $session], $q->requestId);
    });

    $r->get('/api/v1/sessions/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $s = (new ContentStore())->getSession($q->user->id, (string) ($p['id'] ?? ''));
        if ($s === null) {
            Response::error('NOT_FOUND', 'Session not found', $q->requestId, 404);
            return;
        }
        Response::success(['session' => $s], $q->requestId);
    });

    $r->get('/api/v1/notes', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        Response::success(['items' => (new ContentStore())->listNotes($q->user->id)], $q->requestId);
    });

    $r->post('/api/v1/notes', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $body = trim((string) $q->json('body', ''));
        $targetId = (string) $q->json('target_id', '');
        if ($body === '') {
            Response::error('VALIDATION_ERROR', 'body required', $q->requestId, 422);
            return;
        }
        $note = (new ContentStore())->upsertNote([
            'user_id' => $q->user->id,
            'target_type' => (string) $q->json('target_type', 'question'),
            'target_id' => $targetId,
            'body' => $body,
        ]);
        Response::success(['note' => $note], $q->requestId, 201);
    });

    $r->get('/api/v1/favorites', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        Response::success(['items' => (new ContentStore())->listFavorites($q->user->id)], $q->requestId);
    });

    $r->post('/api/v1/favorites/toggle', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $type = (string) $q->json('target_type', 'question');
        $id = (string) $q->json('target_id', '');
        if ($id === '') {
            Response::error('VALIDATION_ERROR', 'target_id required', $q->requestId, 422);
            return;
        }
        $res = (new ContentStore())->toggleFavorite($q->user->id, $type, $id);
        Response::success($res, $q->requestId);
    });
};
