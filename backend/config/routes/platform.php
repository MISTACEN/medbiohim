<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Repositories\ScheduleRepository;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Support\ContentStore;
use Medbiohim\Services\SupabaseRest;

return static function (Router $router): void {
    $router->get('/api/v1/dashboard', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $store = new ContentStore(); $homeworks = []; $tests = []; $profile = null;
        try { $profile = (new UserRepository())->profileBundle($req->user->id); } catch (\Throwable $e) { $profile = ['user'=>$req->user->toArray(),'roles'=>$req->user->role?[$req->user->role]:[],'groups'=>[]]; }
        try { $homeworks=(new HomeworkRepository())->listForUser($req->user->id); } catch(\Throwable $e){ try{$homeworks=SupabaseRest::listHomeworksForUser($req->user->id);}catch(\Throwable $x){} }
        try { $tests=(new TestRepository())->listPublished(null); } catch(\Throwable $e) {}
        foreach((new ContentStore())->listTestsLocal() as $lt){if(!is_array($lt))continue;if(isset($lt['is_published'])&&!$lt['is_published'])continue;$tests[]=['id'=>$lt['id']??null,'title'=>$lt['title']??'Тест','subject_name'=>$lt['subject']??null,'source'=>'local'];}
        $schedule=[];try{$schedule=(new ScheduleRepository())->listForUser($req->user->id);}catch(\Throwable $e){try{$schedule=SupabaseRest::listScheduleForUser($req->user->id);}catch(\Throwable $x){}}
        if(!is_array($schedule)||count($schedule)===0){
            $schedule=(new ContentStore())->listSchedule();
            $today=gmdate('Y-m-d');
            // dashboard: nearest 14 days
            $to=gmdate('Y-m-d', time()+14*86400);
            $schedule=array_values(array_filter($schedule, static fn($x)=>(string)($x['date']??'')>=$today && (string)($x['date']??'')<=$to));
        }
        Response::success(['profile'=>$profile,'site'=>$store->getSite(),'announcements'=>array_slice($store->listAnnouncements(),0,10),'schedule'=>$schedule,'homeworks'=>$homeworks,'tests'=>$tests],$req->requestId);
    });

    $router->get('/api/v1/schedule', static function(Request $req,array $params):void{
        if(!RequireAuth::handle($req))return;
        $from=isset($req->query['from'])?trim((string)$req->query['from']):null;
        $to=isset($req->query['to'])?trim((string)$req->query['to']):null;
        $from=$from!==''?$from:null; $to=$to!==''?$to:null;
        $items=[]; $source='db';
        try{ $items=(new ScheduleRepository())->listForUser($req->user->id,$from,$to); }
        catch(\Throwable $e){
            try{ $items=SupabaseRest::listScheduleForUser($req->user->id,$from,$to); $source='supabase'; }
            catch(\Throwable $x){ $items=[]; }
        }
        if(!is_array($items)||count($items)===0){
            $store=new ContentStore();
            $items=$store->listSchedule();
            if($from){ $items=array_values(array_filter($items,static fn($x)=>(string)($x['date']??'')>=$from)); }
            if($to){ $items=array_values(array_filter($items,static fn($x)=>(string)($x['date']??'')<=$to)); }
            $source='local';
            Response::success(['items'=>$items,'meta'=>$store->scheduleMeta(),'source'=>$source],$req->requestId);
            return;
        }
        Response::success(['items'=>$items,'source'=>$source],$req->requestId);
    });

    $router->get('/api/v1/admin/schedule', static function(Request $req,array $params):void{
        if(!RequireAuth::handle($req)||!RequireRole::handle($req,['teacher','moderator','admin']))return;
        $groupId=isset($req->query['group_id'])?trim((string)$req->query['group_id']):null;
        $semester=isset($req->query['semester'])&&$req->query['semester']!==''?(int)$req->query['semester']:null;
        $items=[]; $source='db';
        try{ $items=(new ScheduleRepository())->listAll($groupId!==''?$groupId:null,$semester); }
        catch(\Throwable $e){
            try{ $items=SupabaseRest::listSchedule($groupId!==''?$groupId:null,$semester); $source='supabase'; }
            catch(\Throwable $x){ $items=[]; }
        }
        if(!is_array($items)||count($items)===0){
            $store=new ContentStore();
            $items=$store->listSchedule();
            $source='local';
            Response::success(['items'=>$items,'meta'=>$store->scheduleMeta(),'source'=>$source],$req->requestId);
            return;
        }
        Response::success(['items'=>$items,'source'=>$source],$req->requestId);
    });

    $router->put('/api/v1/admin/schedule/local', static function(Request $req,array $params):void{
        if(!RequireAuth::handle($req)||!RequireRole::handle($req,['teacher','moderator','admin']))return;
        $items=$req->json('items');
        if(!is_array($items)){ Response::error('VALIDATION_ERROR','items array required',$req->requestId,422); return; }
        $store=new ContentStore();
        $meta=$store->scheduleMeta();
        $payload=['meta'=>$meta?:['title'=>'Расписание','group_code'=>'МБ-201'],'items'=>array_values($items),'updated_at'=>gmdate('c'),'count'=>count($items),'source'=>'admin_cms'];
        $dir=dirname(__DIR__,2).'/data';
        if(!is_dir($dir)) @mkdir($dir,0775,true);
        file_put_contents($dir.'/schedule.json', json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT).PHP_EOL, LOCK_EX);
        Response::success(['items'=>$items,'count'=>count($items),'source'=>'local'],$req->requestId);
    });

    $router->put('/api/v1/admin/schedule', static function(Request $req,array $params):void{if(!RequireAuth::handle($req)||!RequireRole::handle($req,['teacher','moderator','admin']))return;try{Response::success((new ScheduleRepository())->replace($req->jsonBody??[]),$req->requestId);}catch(\InvalidArgumentException $e){Response::error('VALIDATION_ERROR',$e->getMessage(),$req->requestId,422);}catch(\Throwable $e){try{Response::success(SupabaseRest::replaceSchedule($req->jsonBody??[]),$req->requestId);}catch(\InvalidArgumentException $x){Response::error('VALIDATION_ERROR',$x->getMessage(),$req->requestId,422);}catch(\Throwable $x){Response::error('DB_ERROR','Не удалось сохранить расписание',$req->requestId,500);}}});

    $router->get('/api/v1/curriculum',static function(Request $req,array $params):void{if(!RequireAuth::handle($req))return;Response::success(['items'=>(new ContentStore())->listCurriculum()],$req->requestId);});
    $router->get('/api/v1/materials',static function(Request $req,array $params):void{if(!RequireAuth::handle($req))return;$groupId=isset($req->query['group_id'])?(string)$req->query['group_id']:null;try{Response::success(['items'=>(new FileRepository())->listActive($groupId)],$req->requestId);}catch(\Throwable $e){Response::success(['items'=>[],'note'=>'files table unavailable'],$req->requestId);}});
    $router->get('/api/v1/community/posts',static function(Request $req,array $params):void{if(!RequireAuth::handle($req))return;Response::success(['items'=>(new ContentStore())->listCommunityPosts()],$req->requestId);});
    $router->post('/api/v1/community/posts',static function(Request $req,array $params):void{if(!RequireAuth::handle($req))return;$title=trim((string)$req->json('title',''));$body=trim((string)$req->json('body',''));if($title===''||$body===''){Response::error('VALIDATION_ERROR','title and body required',$req->requestId,422);return;}$name=null;try{$bundle=(new UserRepository())->profileBundle($req->user->id);$name=$bundle['user']['full_name']??null;}catch(\Throwable $e){$name=$req->user->email??'Студент';}$row=(new ContentStore())->createCommunityPost(['title'=>$title,'body'=>$body,'author_id'=>$req->user->id,'author_name'=>is_string($name)?$name:'Студент']);Response::success(['post'=>$row],$req->requestId,201);});
    $router->get('/api/v1/progress',static function(Request $req,array $params):void{if(!RequireAuth::handle($req))return;$homeworks=[];$attempts=[];try{$homeworks=(new HomeworkRepository())->listForUser($req->user->id);}catch(\Throwable $e){try{$homeworks=SupabaseRest::listHomeworksForUser($req->user->id);}catch(\Throwable $x){}}try{$attempts=(new TestRepository())->attemptsForUser($req->user->id);}catch(\Throwable $e){}$hwTotal=count($homeworks);$hwDone=0;foreach($homeworks as $h){$st=(string)($h['my_status']??$h['status']??'');if(in_array($st,['submitted','graded','done','сдано','оценено'],true))$hwDone++;}$scores=[];foreach($attempts as $a){if(isset($a['score'])&&is_numeric($a['score']))$scores[]=(float)$a['score'];}$avg=count($scores)?round(array_sum($scores)/count($scores),1):null;Response::success(['homework'=>['total'=>$hwTotal,'done'=>$hwDone,'items'=>$homeworks],'tests'=>['attempts'=>count($attempts),'avg_score'=>$avg,'items'=>$attempts]],$req->requestId);});
};
