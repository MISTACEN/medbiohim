<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\ExamQuestionStore;
use Medbiohim\Services\QuestionBank;

return static function (Router $r): void {
    $r->get('/api/v1/questions', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $filters = [
            'subject' => ($q->query['subject'] ?? null),
            'subject_slug' => ($q->query['subject_slug'] ?? null),
            'kind' => ($q->query['kind'] ?? 'ticket'),
            'type' => ($q->query['type'] ?? null),
            'topic' => ($q->query['topic'] ?? null),
            'q' => ($q->query['q'] ?? null),
        ];
        try {
            $items = ExamQuestionStore::list($filters);
            $source = 'supabase';
        } catch (\Throwable $e) {
            $items = (new QuestionBank())->listQuestions($filters);
            $source = 'local-fallback';
        }
        $limit = max(1, min(200, (int) ($q->query['limit'] ?? 50)));
        $offset = max(0, (int) ($q->query['offset'] ?? 0));
        $slice = array_slice($items, $offset, $limit);
        $list = array_map(static function (array $item): array {
            $out = $item;
            $answer = (string) ($out['answer'] ?? '');
            $out['has_answer'] = $answer !== '';
            if (mb_strlen($answer) > 120) {
                $out['answer_preview'] = mb_substr($answer, 0, 120) . '…';
                unset($out['answer']);
            }
            return $out;
        }, $slice);
        Response::success([
            'items' => $list,
            'total' => count($items),
            'limit' => $limit,
            'offset' => $offset,
            'source' => $source,
        ], $q->requestId);
    });

    $r->get('/api/v1/questions/subjects', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $items = ExamQuestionStore::subjectsSummary();
        } catch (\Throwable $e) {
            $items = (new QuestionBank())->subjectsSummary();
        }
        Response::success(['items' => $items], $q->requestId);
    });

    $r->get('/api/v1/questions/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $id = (string) ($p['id'] ?? '');
        try {
            $item = ExamQuestionStore::get($id);
        } catch (\Throwable $e) {
            $item = (new QuestionBank())->getQuestion($id);
        }
        if ($item === null) {
            Response::error('NOT_FOUND', 'Question not found', $q->requestId, 404);
            return;
        }
        Response::success(['question' => $item], $q->requestId);
    });

    $r->get('/api/v1/tickets', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $items = ExamQuestionStore::banks();
        } catch (\Throwable $e) {
            $items = (new QuestionBank())->ticketBanks();
        }
        Response::success(['items' => $items], $q->requestId);
    });

    $r->post('/api/v1/tickets/generate', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $bankId = (string) $q->json('bank_id', '');
        $count = (int) $q->json('count', 3);
        $mode = (string) $q->json('mode', 'practice');
        if ($bankId === '') {
            Response::error('VALIDATION_ERROR', 'bank_id required', $q->requestId, 422);
            return;
        }
        try {
            try {
                $ticket = ExamQuestionStore::generate($bankId, $count, $mode);
                $ticket['source'] = 'supabase';
            } catch (\Throwable $dbError) {
                $ticket = (new QuestionBank())->generateTicket($bankId, $count, $mode);
                $ticket['source'] = 'local-fallback';
            }
            if ($mode === 'exam') {
                foreach ($ticket['questions'] as &$qq) {
                    unset($qq['answer'], $qq['rubric']);
                }
                unset($qq);
            }
            $ticket['mode'] = $mode;
            Response::success($ticket, $q->requestId);
        } catch (\Throwable $e) {
            Response::error('TICKET_ERROR', $e->getMessage(), $q->requestId, 400);
        }
    });

    $r->get('/api/v1/trainers', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        Response::success(['items' => (new QuestionBank())->trainers()], $q->requestId);
    });

    $r->get('/api/v1/trainers/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $t = (new QuestionBank())->getTrainer((string) ($p['id'] ?? ''));
        if ($t === null) {
            Response::error('NOT_FOUND', 'Trainer not found', $q->requestId, 404);
            return;
        }
        Response::success(['trainer' => $t], $q->requestId);
    });
};
