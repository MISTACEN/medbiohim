<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SupabaseAcademic;
return static function(Router $r):void{
    $r->get('/api/v1/community/posts', static function(Request $q,array $p):void{
        if(!RequireAuth::handle($q)) return;
        try { Response::success(['items'=>SupabaseAcademic::communityPosts()],$q->requestId); }
        catch(\Throwable $e) { \Medbiohim\Support\Logger::error('community_list_failed',['requestId'=>$q->requestId,'message'=>$e->getMessage()]); Response::error('DB_UNAVAILABLE','Сообщество временно недоступно',$q->requestId,503); }
    });
    $r->post('/api/v1/community/posts', static function(Request $q,array $p):void{
        if(!RequireAuth::handle($q)) return;
        $title=trim((string)$q->json('title','')); $body=trim((string)$q->json('body',''));
        if($title===''||$body===''){Response::error('VALIDATION_ERROR','title and body required',$q->requestId,422);return;}
        try { $row=SupabaseAcademic::createCommunityPost($q->user->id,$title,$body); Response::success(['post'=>$row],$q->requestId,201); }
        catch(\Throwable $e) { \Medbiohim\Support\Logger::error('community_create_failed',['requestId'=>$q->requestId,'message'=>$e->getMessage()]); Response::error('DB_ERROR','Не удалось создать публикацию',$q->requestId,500); }
    });
};
