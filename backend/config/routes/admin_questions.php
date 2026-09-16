<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\ExamQuestionStore;
use Medbiohim\Support\ContentStore;

return static function (Router $r): void {
    $manager = static function (Request $q): bool {
        return RequireAuth::handle($q) && RequireRole::handle($q, ['admin', 'teacher', 'moderator']);
    };

    $r->get('/api/v1/admin/questions', static function (Request $q, array $p) use ($manager): void {
        if (!$manager($q)) return;
        $filters = [
            'subject_slug' => ($q->query['subject_slug'] ?? ''),
            'kind' => ($q->query['kind'] ?? 'ticket'),
            'q' => ($q->query['q'] ?? ''),
            'subject' => ($q->query['subject'] ?? ''),
        ];
        try {
            $items = ExamQuestionStore::list($filters);
            $source = 'supabase';
        } catch (\Throwable $e) {
            $items = (new ContentStore())->listQuestionsBank();
            $source = 'local-fallback';
            if ($filters['kind'] !== '') {
                $items = array_values(array_filter($items, static fn($x) => (string) ($x['kind'] ?? '') === $filters['kind']));
            }
        }
        $limit = max(1, min(200, (int) ($q->query['limit'] ?? 50)));
        $offset = max(0, (int) ($q->query['offset'] ?? 0));
        Response::success([
            'items' => array_slice($items, $offset, $limit),
            'total' => count($items),
            'source' => $source,
        ], $q->requestId);
    });

    $r->post('/api/v1/admin/questions', static function (Request $q, array $p) use ($manager): void {
        if (!$manager($q)) return;
        try {
            $row = ExamQuestionStore::upsert([
                'subject' => (string) $q->json('subject', 'Общий'),
                'subject_name' => (string) $q->json('subject_name', ''),
                'subject_slug' => (string) $q->json('subject_slug', 'general'),
                'topic' => (string) $q->json('topic', ''),
                'type' => (string) $q->json('type', 'open'),
                'text' => (string) $q->json('text', ''),
                'answer' => (string) $q->json('answer', ''),
                'is_published' => (bool) $q->json('is_published', true),
            ]);
            Response::success(['question' => $row], $q->requestId, 201);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $q->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->put('/api/v1/admin/questions/{id}', static function (Request $q, array $p) use ($manager): void {
        if (!$manager($q)) return;
        $id = (string) ($p['id'] ?? '');
        try {
            $current = ExamQuestionStore::get($id);
            if ($current === null) {
                Response::error('NOT_FOUND', 'Question not found', $q->requestId, 404);
                return;
            }
            $keys = ['subject', 'subject_name', 'subject_slug', 'topic', 'type', 'text', 'answer', 'is_published'];
            $patch = $current;
            foreach ($keys as $key) {
                $v = $q->json($key, null);
                if ($v !== null) $patch[$key] = $v;
            }
            $row = ExamQuestionStore::upsert($patch, $id);
            Response::success(['question' => $row], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->delete('/api/v1/admin/questions/{id}', static function (Request $q, array $p) use ($manager): void {
        if (!$manager($q)) return;
        try {
            $id = (string) ($p['id'] ?? '');
            if (ExamQuestionStore::get($id) === null) {
                Response::error('NOT_FOUND', 'Question not found', $q->requestId, 404);
                return;
            }
            ExamQuestionStore::delete($id);
            Response::success(['deleted' => true], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });
};
