<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;\nuse Medbiohim\Database\Connection;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\ExamQuestionStore;

return static function (Router $r): void {
    $r->get('/api/v1/questions', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $filters = [
            'subject' => ($q->query['subject'] ?? null),
            'subject_slug' => ($q->query['subject_slug'] ?? null),
            'subject_id' => ($q->query['subject_id'] ?? null),
            'kind' => ($q->query['kind'] ?? ''),
            'type' => ($q->query['type'] ?? null),
            'topic' => ($q->query['topic'] ?? null),
            'q' => ($q->query['q'] ?? null),
        ];
        try {
            $items = ExamQuestionStore::list($filters);
            $limit = max(1, min(200, (int) ($q->query['limit'] ?? 50)));
            $offset = max(0, (int) ($q->query['offset'] ?? 0));
            $slice = array_slice($items, $offset, $limit);
            $includeAnswer = in_array(strtolower(trim((string) ($q->query['include_answer'] ?? ''))), ['1','true','yes'], true);
            $list = array_map(static function (array $item) use ($includeAnswer): array {
                $out = $item;
                $answer = (string) ($out['answer'] ?? '');
                $out['has_answer'] = $answer !== '';
                if (!$includeAnswer && mb_strlen($answer) > 120) {
                    $out['answer_preview'] = mb_substr($answer, 0, 120) . '…';
                    unset($out['answer']);
                }
                return $out;
            }, $slice);
            Response::success(['items'=>$list,'total'=>count($items),'limit'=>$limit,'offset'=>$offset,'source'=>'supabase','answers_included'=>$includeAnswer], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE','Банк вопросов временно недоступен',$q->requestId,503);
        }
    });

    $r->get('/api/v1/questions/subjects', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try { Response::success(['items'=>ExamQuestionStore::subjectsSummary(),'source'=>'supabase'], $q->requestId); }
        catch (\Throwable $e) { Response::error('DB_UNAVAILABLE','Каталог вопросов временно недоступен',$q->requestId,503); }
    });

    $r->get('/api/v1/questions/mini-quiz', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $subjectId = trim((string) ($q->query['subject_id'] ?? ''));
        $rawIds = trim((string) ($q->query['ids'] ?? ''));
        $ids = array_values(array_unique(array_filter(array_map('trim', explode(',', $rawIds)))));
        if ($subjectId === '' || !$ids) {
            Response::error('VALIDATION_ERROR', 'subject_id и ids обязательны', $q->requestId, 422);
            return;
        }
        $ids = array_slice($ids, 0, 12);
        try {
            $db = Connection::pdo();
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $db->prepare(
                "SELECT id, subject_id, module_id, topic_id, type, text, options
                 FROM public.questions
                 WHERE id IN ({$placeholders})
                   AND subject_id = ?
                   AND is_published = true
                   AND archived_at IS NULL"
            );
            $params = array_merge($ids, [$subjectId]);
            $stmt->execute($params);
            $rows = $stmt->fetchAll() ?: [];
            $byId = [];
            foreach ($rows as $row) {
                $options = $row['options'];
                if (is_string($options)) $options = json_decode($options, true);
                $clean = [];
                foreach (is_array($options) ? $options : [] as $index => $option) {
                    $clean[] = [
                        'index' => (int) $index,
                        'label' => is_array($option) ? (string) ($option['label'] ?? '') : (string) $option,
                    ];
                }
                $row['options'] = $clean;
                $byId[(string) $row['id']] = $row;
            }
            $items = [];
            foreach ($ids as $id) if (isset($byId[$id])) $items[] = $byId[$id];
            Response::success(['items' => $items, 'source' => 'db'], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Мини-тест временно недоступен', $q->requestId, 503);
        }
    });

    $r->post('/api/v1/questions/mini-quiz/check', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $questionId = trim((string) $q->json('question_id', ''));
        $subjectId = trim((string) $q->json('subject_id', ''));
        $selectedRaw = $q->json('selected_indexes', []);
        $selected = [];
        if (is_array($selectedRaw)) {
            foreach ($selectedRaw as $value) if (is_numeric($value)) $selected[] = (int) $value;
        }
        $selected = array_values(array_unique($selected));
        if ($questionId === '' || $subjectId === '') {
            Response::error('VALIDATION_ERROR', 'question_id и subject_id обязательны', $q->requestId, 422);
            return;
        }
        try {
            $db = Connection::pdo();
            $stmt = $db->prepare(
                'SELECT id, subject_id, type, answer, options
                 FROM public.questions
                 WHERE id = :id AND subject_id = :subject_id AND is_published = true AND archived_at IS NULL
                 LIMIT 1'
            );
            $stmt->execute(['id' => $questionId, 'subject_id' => $subjectId]);
            $row = $stmt->fetch();
            if ($row === false) {
                Response::error('NOT_FOUND', 'Вопрос мини-теста не найден', $q->requestId, 404);
                return;
            }

            $options = $row['options'];
            if (is_string($options)) $options = json_decode($options, true);
            $correct = [];
            $correctLabels = [];
            foreach (is_array($options) ? $options : [] as $index => $option) {
                $isCorrect = is_array($option) && !empty($option['correct']);
                if ($isCorrect) {
                    $correct[] = (int) $index;
                    $correctLabels[] = mb_strtolower(trim((string) ($option['label'] ?? '')));
                }
            }
            if (!$correct && preg_match('/^\s*\d+(?:\s*,\s*\d+)*\s*$/', (string) ($row['answer'] ?? ''))) {
                foreach (preg_split('/\s*,\s*/', trim((string) $row['answer'])) as $value) $correct[] = (int) $value;
            }
            if (!$correct && (string) ($row['answer'] ?? '') !== '') {
                $answer = mb_strtolower(trim((string) $row['answer']));
                foreach (is_array($options) ? $options : [] as $index => $option) {
                    $label = mb_strtolower(trim((string) (is_array($option) ? ($option['label'] ?? '') : $option)));
                    if ($label !== '' && $label === $answer) $correct[] = (int) $index;
                }
            }
            sort($correct);
            sort($selected);
            $isCorrect = $correct !== [] && $selected === $correct;
            Response::success([
                'correct' => $isCorrect,
                'selected_count' => count($selected),
                'required_count' => count($correct),
                'question_type' => (string) ($row['type'] ?? 'mcq'),
            ], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Не удалось проверить ответ мини-теста', $q->requestId, 503);
        }
    });

    $r->get('/api/v1/questions/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $item = ExamQuestionStore::get((string) ($p['id'] ?? ''));
            if ($item === null) { Response::error('NOT_FOUND','Question not found',$q->requestId,404); return; }
            Response::success(['question'=>$item,'source'=>'supabase'],$q->requestId);
        } catch (\Throwable $e) { Response::error('DB_UNAVAILABLE','Вопрос временно недоступен',$q->requestId,503); }
    });

    $r->get('/api/v1/tickets', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try { Response::success(['items'=>ExamQuestionStore::banks(),'source'=>'supabase'], $q->requestId); }
        catch (\Throwable $e) { Response::error('DB_UNAVAILABLE','Банки билетов временно недоступны',$q->requestId,503); }
    });

    $r->post('/api/v1/tickets/generate', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $bankId = trim((string) $q->json('bank_id',''));
        $count = (int) $q->json('count',3);
        $mode = (string) $q->json('mode','practice');
        if ($bankId === '') { Response::error('VALIDATION_ERROR','bank_id required',$q->requestId,422); return; }
        try {
            $ticket = ExamQuestionStore::generate($bankId,max(1,min(20,$count)),$mode);
            if ($mode === 'exam') {
                foreach ($ticket['questions'] as &$qq) { unset($qq['answer'],$qq['rubric']); }
                unset($qq);
            }
            $ticket['mode']=$mode;
            $ticket['source']='supabase';
            Response::success($ticket,$q->requestId);
        } catch (\Throwable $e) {
            Response::error('TICKET_ERROR','Не удалось сформировать билет: данные банка недоступны',$q->requestId,503);
        }
    });


};
