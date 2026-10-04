<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\LectureGeneratorService;
use Medbiohim\Services\LectureService;
use Medbiohim\Support\RateLimiter;

return static function (Router $r): void {
    $r->get('/api/v1/lectures', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $slug = isset($q->query['subject']) ? (string) $q->query['subject'] : null;
        $items = (new LectureService())->listPublished($slug !== '' ? $slug : null);
        $public = array_map(static function ($row) {
            return [
                'id' => $row['id'] ?? null,
                'title' => $row['title'] ?? '',
                'subject' => $row['subject'] ?? '',
                'subject_slug' => $row['subject_slug'] ?? '',
                'topic' => $row['topic'] ?? '',
                'summary' => $row['summary'] ?? '',
                'published_at' => $row['published_at'] ?? null,
                'media_count' => is_array($row['media'] ?? null) ? count($row['media']) : 0,
            ];
        }, $items);
        Response::success(['items' => $public, 'count' => count($public)], $q->requestId);
    });

    $r->get('/api/v1/lectures/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $id = (string) ($p['id'] ?? '');
        $row = (new LectureService())->getPublished($id);
        if ($row === null) {
            Response::error('NOT_FOUND', 'Лекция не найдена или ещё не опубликована', $q->requestId, 404);
            return;
        }
        // PDF attachments automatically become published materials; the lecture keeps its attachment list.
        if (isset($patch['attachments']) && is_array($patch['attachments'])) {
            try {
                $db = \Medbiohim\Database\Connection::pdo();
                $subjectSlug = trim((string)($row['subject_slug'] ?? $patch['subject_slug'] ?? ''));
                $subjectId = '';
                if ($subjectSlug !== '') {
                    $s = $db->prepare('SELECT id FROM public.subjects WHERE slug = :slug ORDER BY semester NULLS LAST, id LIMIT 1');
                    $s->execute(['slug'=>$subjectSlug]);
                    $subjectId = (string)($s->fetchColumn() ?: '');
                }
                if ($subjectId !== '') {
                    foreach ($patch['attachments'] as $att) {
                        if (!is_array($att)) continue;
                        $type = strtolower(trim((string)($att['type'] ?? '')));
                        $mime = strtolower(trim((string)($att['mime_type'] ?? '')));
                        $fileId = trim((string)($att['file_id'] ?? ''));
                        if ($fileId === '' || ($type !== 'pdf' && $mime !== 'application/pdf')) continue;
                        $exists = $db->prepare('SELECT id FROM public.materials WHERE file_id = :file_id LIMIT 1');
                        $exists->execute(['file_id'=>$fileId]);
                        if ($exists->fetchColumn()) continue;
                        $title = trim((string)($att['name'] ?? 'PDF лекции'));
                        $db->prepare('INSERT INTO public.materials (subject_id,type,title,file_id,external_url,content_html,order_index,is_published) VALUES (:subject_id,:type,:title,:file_id,NULL,NULL,0,true)')
                           ->execute(['subject_id'=>$subjectId,'type'=>'pdf','title'=>$title,'file_id'=>$fileId]);
                    }
                }
            } catch (\Throwable $e) {
                // Lecture save remains successful; materials sync can be repaired from the attachment list.
            }
        }
        Response::success(['lecture' => $row], $q->requestId);
    });

    $r->get('/api/v1/admin/lectures', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator', 'teacher'])) return;
        $status = isset($q->query['status']) ? (string) $q->query['status'] : null;
        $slug = isset($q->query['subject']) ? (string) $q->query['subject'] : null;
        $items = (new LectureService())->listAll(
            $status !== '' ? $status : null,
            $slug !== '' ? $slug : null
        );
        Response::success(['items' => $items, 'count' => count($items)], $q->requestId);
    });

    $r->get('/api/v1/admin/lectures/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator', 'teacher'])) return;
        $row = (new LectureService())->get((string) ($p['id'] ?? ''));
        if ($row === null) {
            Response::error('NOT_FOUND', 'Лекция не найдена', $q->requestId, 404);
            return;
        }
        Response::success(['lecture' => $row], $q->requestId);
    });

    $r->post('/api/v1/admin/lectures/generate', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator', 'teacher'])) return;
        $rl = RateLimiter::attempt('lec-gen:' . RateLimiter::clientIp(), 10, 3600);
        if (empty($rl['allowed'])) {
            Response::error('RATE_LIMIT', 'Слишком много генераций, подождите', $q->requestId, 429);
            return;
        }
        $slug = trim((string) ($q->json('subject_slug') ?? ''));
        $topic = trim((string) ($q->json('topic') ?? ''));
        $notesRaw = $q->json('notes');
        $notes = $notesRaw !== null ? trim((string) $notesRaw) : null;
        $imageUrl = $q->json('image_url');
        $imageUrl = $imageUrl !== null && trim((string)$imageUrl) !== '' ? trim((string)$imageUrl) : null;
        if ($slug === '' || $topic === '') {
            Response::error('VALIDATION', 'subject_slug и topic обязательны', $q->requestId, 422);
            return;
        }
        try {
            $gen = (new LectureGeneratorService())->generate($slug, $topic, $notes, $imageUrl);
            $uid = $q->user?->id !== null ? (string) $q->user->id : null;
            $row = (new LectureService())->create(array_merge($gen, [
                'status' => 'pending_review',
                'created_by' => $uid,
            ]));
            Response::success(['lecture' => $row], $q->requestId, 201);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION', $e->getMessage(), $q->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('GENERATE_FAILED', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->patch('/api/v1/admin/lectures/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator', 'teacher'])) return;
        $id = (string) ($p['id'] ?? '');
        $body = is_array($q->jsonBody) ? $q->jsonBody : [];
        $allowed = ['title', 'topic', 'body_md', 'body_html', 'summary', 'media', 'attachments', 'subject', 'subject_slug', 'status'];
        $patch = [];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $body)) {
                $patch[$k] = $body[$k];
            }
        }
        if ($patch === []) {
            Response::error('VALIDATION', 'Нет полей для обновления', $q->requestId, 422);
            return;
        }
        $row = (new LectureService())->update($id, $patch);
        if ($row === null) {
            Response::error('NOT_FOUND', 'Лекция не найдена', $q->requestId, 404);
            return;
        }
        Response::success(['lecture' => $row], $q->requestId);
    });

    $r->post('/api/v1/admin/lectures/{id}/publish', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator'])) return;
        $id = (string) ($p['id'] ?? '');
        $uid = $q->user?->id !== null ? (string) $q->user->id : null;
        $row = (new LectureService())->setStatus($id, 'published', $uid);
        if ($row === null) {
            Response::error('NOT_FOUND', 'Лекция не найдена', $q->requestId, 404);
            return;
        }
        Response::success(['lecture' => $row], $q->requestId);
    });

    $r->post('/api/v1/admin/lectures/{id}/reject', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator'])) return;
        $id = (string) ($p['id'] ?? '');
        $uid = $q->user?->id !== null ? (string) $q->user->id : null;
        $row = (new LectureService())->setStatus($id, 'rejected', $uid);
        if ($row === null) {
            Response::error('NOT_FOUND', 'Лекция не найдена', $q->requestId, 404);
            return;
        }
        Response::success(['lecture' => $row], $q->requestId);
    });

    $r->delete('/api/v1/admin/lectures/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator'])) return;
        $ok = (new LectureService())->delete((string) ($p['id'] ?? ''));
        if (!$ok) {
            Response::error('NOT_FOUND', 'Лекция не найдена', $q->requestId, 404);
            return;
        }
        Response::success(['deleted' => true], $q->requestId);
    });

    
};
