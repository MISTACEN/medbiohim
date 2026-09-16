<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Support\ContentStore;

return static function (Router $r): void {
    $r->get('/api/v1/admin/questions', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['admin', 'teacher', 'moderator'])) {
            return;
        }
        $items = (new ContentStore())->listQuestionsBank();
        $slug = (string) ($q->query['subject_slug'] ?? '');
        $kind = (string) ($q->query['kind'] ?? '');
        $search = mb_strtolower((string) ($q->query['q'] ?? ''));
        if ($slug !== '' || $kind !== '' || $search !== '') {
            $items = array_values(array_filter($items, static function ($item) use ($slug, $kind, $search) {
                if ($slug !== '' && (string) ($item['subject_slug'] ?? '') !== $slug) {
                    return false;
                }
                if ($kind !== '' && (string) ($item['kind'] ?? '') !== $kind) {
                    return false;
                }
                if ($search !== '' && !str_contains(mb_strtolower((string) ($item['text'] ?? '')), $search)) {
                    return false;
                }
                return true;
            }));
        }
        $limit = max(1, min(100, (int) ($q->query['limit'] ?? 50)));
        $offset = max(0, (int) ($q->query['offset'] ?? 0));
        Response::success([
            'items' => array_slice($items, $offset, $limit),
            'total' => count($items),
        ], $q->requestId);
    });

    $r->post('/api/v1/admin/questions', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['admin', 'teacher'])) {
            return;
        }
        $text = trim((string) $q->json('text', ''));
        if ($text === '') {
            Response::error('VALIDATION_ERROR', 'text required', $q->requestId, 422);
            return;
        }
        $row = (new ContentStore())->upsertQuestion([
            'subject' => (string) $q->json('subject', 'Общий'),
            'subject_slug' => (string) $q->json('subject_slug', 'general'),
            'topic' => (string) $q->json('topic', ''),
            'kind' => (string) $q->json('kind', 'main'),
            'type' => (string) $q->json('type', 'open'),
            'text' => $text,
            'answer' => (string) $q->json('answer', ''),
            'options' => $q->json('options', null),
            'correct' => $q->json('correct', null),
            'rubric' => (string) $q->json('rubric', ''),
            'course' => $q->json('course', null),
            'semester' => $q->json('semester', null),
        ]);
        Response::success(['question' => $row], $q->requestId, 201);
    });

    $r->put('/api/v1/admin/questions/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['admin', 'teacher'])) {
            return;
        }
        $id = (string) ($p['id'] ?? '');
        $store = new ContentStore();
        $items = $store->listQuestionsBank();
        $found = null;
        foreach ($items as $item) {
            if ((string) ($item['id'] ?? '') === $id) {
                $found = $item;
                break;
            }
        }
        if ($found === null) {
            Response::error('NOT_FOUND', 'Question not found', $q->requestId, 404);
            return;
        }
        $patch = ['id' => $id];
        foreach (['subject', 'subject_slug', 'topic', 'kind', 'type', 'text', 'answer', 'options', 'correct', 'rubric', 'course', 'semester'] as $key) {
            $v = $q->json($key, null);
            if ($v !== null) {
                $patch[$key] = $v;
            }
        }
        $row = $store->upsertQuestion(array_merge($found, $patch));
        Response::success(['question' => $row], $q->requestId);
    });

    $r->delete('/api/v1/admin/questions/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q) || !RequireRole::handle($q, ['admin', 'teacher'])) {
            return;
        }
        $ok = (new ContentStore())->deleteQuestion((string) ($p['id'] ?? ''));
        if (!$ok) {
            Response::error('NOT_FOUND', 'Question not found', $q->requestId, 404);
            return;
        }
        Response::success(['deleted' => true], $q->requestId);
    });
};
