<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
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
