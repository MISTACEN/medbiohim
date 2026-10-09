<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\AiChatService;
use Medbiohim\Support\RateLimiter;

return static function(Router $router): void {
    $router->get('/api/v1/ai/providers', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try { Response::success(['providers'=>(new AiChatService())->providers()],$req->requestId); }
        catch(\Throwable $e){ \Medbiohim\Support\Logger::error('ai_chat_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('AI_ERROR', 'ИИ-сервис временно недоступен', $req->requestId, 500); }
    });

    $router->get('/api/v1/ai/conversations', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try { Response::success(['items'=>(new AiChatService())->listConversations($req->user->id)],$req->requestId); }
        catch(\Throwable $e){ \Medbiohim\Support\Logger::error('ai_chat_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('AI_ERROR', 'ИИ-сервис временно недоступен', $req->requestId, 500); }
    });

    $router->post('/api/v1/ai/conversations', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try {
            $x=(new AiChatService())->createConversation(
                $req->user->id,
                $req->json('title')!==null?(string)$req->json('title'):null,
                (string)($req->json('provider')??'auto'),
                $req->json('subject_slug')!==null?(string)$req->json('subject_slug'):null
            );
            Response::success(['conversation'=>$x],$req->requestId,201);
        } catch(\InvalidArgumentException $e){ Response::error('VALIDATION_ERROR',$e->getMessage(),$req->requestId,422); }
        catch(\Throwable $e){ \Medbiohim\Support\Logger::error('ai_chat_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('AI_ERROR', 'ИИ-сервис временно недоступен', $req->requestId, 500); }
    });

    $router->get('/api/v1/ai/conversations/{id}', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try { Response::success((new AiChatService())->getConversation($req->user->id,(string)$params['id']),$req->requestId); }
        catch(\Throwable $e){ Response::error('AI_ERROR',$e->getMessage(),$req->requestId,404); }
    });

    $router->delete('/api/v1/ai/conversations/{id}', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try { (new AiChatService())->deleteConversation($req->user->id,(string)$params['id']); Response::success(['deleted'=>true],$req->requestId); }
        catch(\Throwable $e){ \Medbiohim\Support\Logger::error('ai_chat_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('AI_ERROR', 'ИИ-сервис временно недоступен', $req->requestId, 500); }
    });

    $router->post('/api/v1/ai/conversations/{id}/messages', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        $uid=(string)$req->user->id;
        $rl=RateLimiter::attempt('ai-chat:'.$uid,30,300);
        if(!($rl['allowed']??true)){ Response::error('RATE_LIMIT','Слишком много запросов к AI. Подождите несколько минут.',$req->requestId,429); return; }
        try {
            $out=(new AiChatService())->send(
                $uid,
                (string)$params['id'],
                (string)($req->json('content')??''),
                $req->json('provider')!==null?(string)$req->json('provider'):null,
                $req->json('subject_slug')!==null?(string)$req->json('subject_slug'):null
            );
            Response::success($out,$req->requestId);
        } catch(\InvalidArgumentException $e){ Response::error('VALIDATION_ERROR',$e->getMessage(),$req->requestId,422); }
        catch(\Throwable $e){ \Medbiohim\Support\Logger::error('ai_chat_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('AI_ERROR', 'ИИ-сервис временно недоступен', $req->requestId, 500); }
    });
};
