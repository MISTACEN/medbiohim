<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\ExamQuestionStore;
use Medbiohim\Database\Connection;

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
            'published_only' => false,
        ];
        try {
            $items = ExamQuestionStore::list($filters);
            $source = 'supabase';
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Банк вопросов временно недоступен', $q->requestId, 503);
            return;
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
            \Medbiohim\Support\Logger::error('admin_question_write_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('DB_ERROR', 'Не удалось сохранить вопрос', $q->requestId, 503);
        }
    });

    $r->put('/api/v1/admin/questions/{id}', static function (Request $q, array $p) use ($manager): void {
        if (!$manager($q)) return;
        $id = (string) ($p['id'] ?? '');
        try {
            $current = ExamQuestionStore::get($id, false);
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
            \Medbiohim\Support\Logger::error('admin_question_write_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('DB_ERROR', 'Не удалось сохранить вопрос', $q->requestId, 503);
        }
    });

    $bankAdmin = static function (Request $q): bool {
        return RequireAuth::handle($q) && RequireRole::handle($q, ['admin', 'teacher', 'moderator']);
    };

    $r->put('/api/v1/admin/question-bank/{id}', static function (Request $q, array $p) use ($bankAdmin): void {
        if (!$bankAdmin($q)) return;
        $id = trim((string) ($p['id'] ?? ''));
        if ($id === '') {
            Response::error('VALIDATION_ERROR', 'Question id required', $q->requestId, 422);
            return;
        }

        $db = null;
        try {
            $db = Connection::pdo();
            $db->beginTransaction();

            $st = $db->prepare('SELECT id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,source_key,archived_at FROM public.questions WHERE id=:id LIMIT 1 FOR UPDATE');
            $st->execute(['id' => $id]);
            $current = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$current) {
                $db->rollBack();
                Response::error('NOT_FOUND', 'Question not found', $q->requestId, 404);
                return;
            }

            $type = (string) ($q->json('type', $current['type'] ?? 'mcq'));
            $text = trim((string) ($q->json('text', $current['text'] ?? '')));
            $answer = (string) ($q->json('answer', $current['answer'] ?? ''));
            $options = $q->json('options', null);

            if ($text === '') {
                $db->rollBack();
                Response::error('VALIDATION_ERROR', 'Question text is required', $q->requestId, 422);
                return;
            }
            if ($type === 'mcq') {
                if (!is_array($options) || count($options) < 2) {
                    $db->rollBack();
                    Response::error('VALIDATION_ERROR', 'Для выбора нужно минимум 2 варианта ответа', $q->requestId, 422);
                    return;
                }
                $normalized = [];
                $correctCount = 0;
                foreach ($options as $item) {
                    if (is_array($item)) {
                        $label = trim((string) ($item['label'] ?? ''));
                        $correct = (bool) ($item['correct'] ?? false);
                    } else {
                        $label = trim((string) $item);
                        $correct = false;
                    }
                    if ($label === '') {
                        $db->rollBack();
                        Response::error('VALIDATION_ERROR', 'Все варианты ответа должны иметь текст', $q->requestId, 422);
                        return;
                    }
                    if ($correct) $correctCount++;
                    $normalized[] = ['label' => $label, 'correct' => $correct];
                }
                if ($correctCount < 1) {
                    $db->rollBack();
                    Response::error('VALIDATION_ERROR', 'Отметьте хотя бы один правильный вариант', $q->requestId, 422);
                    return;
                }
                $options = $normalized;
            } else {
                if ($options !== null && !is_array($options)) $options = null;
            }

            $old = $current;
            if (isset($old['options']) && is_string($old['options'])) {
                $old['options'] = json_decode($old['options'], true) ?? [];
            }
            $version = $db->prepare("SELECT COALESCE(MAX(version_no),0)+1 FROM public.content_versions WHERE table_name='questions' AND row_key = :row_key::jsonb");
            $rowKey = json_encode(['id' => $id], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $version->execute(['row_key' => $rowKey]);
            $versionNo = (int) $version->fetchColumn();

            $snapshot = $db->prepare("INSERT INTO public.content_versions(table_name,row_key,version_no,data,source,actor_user_id) VALUES ('questions',:row_key::jsonb,:version_no,:data::jsonb,'admin_ui',:actor)");
            $snapshot->execute([
                'row_key' => $rowKey,
                'version_no' => $versionNo,
                'data' => json_encode($old, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'actor' => $q->user->id ?? null,
            ]);

            $upd = $db->prepare('UPDATE public.questions SET type=:type,text=:text,answer=:answer,options=:options::jsonb WHERE id=:id');
            $upd->execute([
                'id' => $id,
                'type' => $type,
                'text' => $text,
                'answer' => $answer,
                'options' => json_encode($options ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);

            $st2 = $db->prepare('SELECT id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,source_key,archived_at FROM public.questions WHERE id=:id LIMIT 1');
            $st2->execute(['id' => $id]);
            $row = $st2->fetch(\PDO::FETCH_ASSOC);
            if (isset($row['options']) && is_string($row['options'])) $row['options'] = json_decode($row['options'], true) ?? [];

            $db->commit();
            Response::success(['question' => $row, 'version_no' => $versionNo], $q->requestId);
        } catch (\Throwable $e) {
            if ($db instanceof \PDO && $db->inTransaction()) $db->rollBack();
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
