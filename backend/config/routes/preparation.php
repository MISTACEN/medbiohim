<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Database\Connection;

return static function (Router $router): void {
 $auth=static function(Request $r):bool{return RequireAuth::handle($r);};

 $router->post('/api/v1/tests/{id}/preparation/start',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return;
  $testId=(string)$p['id']; $body=is_array($r->jsonBody??null)?$r->jsonBody:[];
  $mode=($body['mode']??'full')==='count'?'count':'full'; $limit=$mode==='count'?max(1,min(200,(int)($body['question_limit']??10))):null;
  try{
   $db=Connection::pdo();
   $q=$db->prepare("select tq.question_id from public.test_questions tq join public.questions q on q.id=tq.question_id where tq.test_id=:tid and q.is_published=true and q.archived_at is null order by tq.order_index asc,tq.question_id");
   $q->execute(['tid'=>$testId]); $ids=array_column($q->fetchAll()?:[],'question_id');
   if($limit!==null)$ids=array_slice($ids,0,$limit);
   if(!$ids){Response::error('NO_QUESTIONS','В тесте нет опубликованных вопросов', $r->requestId,422);return;}
   $s=$db->prepare("select * from public.test_preparation_sessions where user_id=:uid and test_id=:tid and status='in_progress' limit 1");
   $s->execute(['uid'=>$r->user->id,'tid'=>$testId]); $existing=$s->fetch();
   if($existing){Response::success(['session'=>$existing],$r->requestId);return;}
   $s=$db->prepare("insert into public.test_preparation_sessions(user_id,test_id,mode,question_limit,question_ids) values(:uid,:tid,:mode,:lim,:ids) returning *");
   $s->execute(['uid'=>$r->user->id,'tid'=>$testId,'mode'=>$mode,'lim'=>$limit,'ids'=>'{'.implode(',',array_map(static fn($x)=>'"'.$x.'"',$ids)).'}']);
   Response::success(['session'=>$s->fetch(),'question_ids'=>$ids],$r->requestId,201);
  }catch(\Throwable $e){Response::error('PREPARATION_ERROR',$e->getMessage(),$r->requestId,422);}
 });

 $router->get('/api/v1/tests/preparation/{id}',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return; try{$db=Connection::pdo();
   $s=$db->prepare("select ps.*,t.title as test_title from public.test_preparation_sessions ps join public.tests t on t.id=ps.test_id where ps.id=:id and ps.user_id=:uid");
   $s->execute(['id'=>$p['id'],'uid'=>$r->user->id]);$session=$s->fetch();
   if(!$session){Response::error('NOT_FOUND','Preparation session not found',$r->requestId,404);return;}
   $q=$db->prepare("select q.id,q.text as body,q.options,q.type,q.answer,q.subject_id,q.module_id,q.topic_id,m.name as module_name,top.name as topic_name from public.questions q left join public.modules m on m.id=q.module_id left join public.topics top on top.id=q.topic_id where q.id = any(:ids::uuid[])");
   $q->execute(['ids'=>'{'.implode(',',array_map(static fn($x)=>'"'.$x.'"',$session['question_ids'])).'}']);$questions=$q->fetchAll()?:[];
   $a=$db->prepare("select question_id,answer_text,is_correct,score from public.test_preparation_results where session_id=:sid");$a->execute(['sid'=>$session['id']]);
   Response::success(['session'=>$session,'questions'=>$questions,'answers'=>$a->fetchAll()?:[]],$r->requestId);
  }catch(\Throwable $e){Response::error('PREPARATION_ERROR',$e->getMessage(),$r->requestId,422);}
 });

 $router->patch('/api/v1/tests/preparation/{id}',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return; $b=is_array($r->jsonBody??null)?$r->jsonBody:[]; try{$db=Connection::pdo();$db->beginTransaction();
   $check=$db->prepare("select * from public.test_preparation_sessions where id=:id and user_id=:uid for update");$check->execute(['id'=>$p['id'],'uid'=>$r->user->id]);$s=$check->fetch();
   if(!$s){$db->rollBack();Response::error('NOT_FOUND','Session not found',$r->requestId,404);return;}
   $idx=array_key_exists('current_index',$b)?max(0,(int)$b['current_index']):(int)$s['current_index'];
   if(isset($b['question_id'])){
    $ans=$db->prepare("select answer from public.questions where id=:qid");$ans->execute(['qid'=>$b['question_id']]);$correct=$ans->fetchColumn();
    $given=array_key_exists('answer_text',$b)?(string)$b['answer_text']:null;
    $ok=$correct!==false && $given!==null && trim(mb_strtolower($given))===trim(mb_strtolower((string)$correct));
    $up=$db->prepare("insert into public.test_preparation_results(session_id,user_id,test_id,question_id,answer_text,is_correct,score) values(:sid,:uid,:tid,:qid,:a,:ok,:score) on conflict(session_id,question_id) do update set answer_text=excluded.answer_text,is_correct=excluded.is_correct,score=excluded.score,answered_at=now()");
    $up->execute(['sid'=>$s['id'],'uid'=>$r->user->id,'tid'=>$s['test_id'],'qid'=>$b['question_id'],'a'=>$given,'ok'=>$ok,'score'=>$ok?1:0]);
   }
   $up=$db->prepare("update public.test_preparation_sessions set current_index=:idx,last_saved_at=now() where id=:id returning *");$up->execute(['idx'=>$idx,'id'=>$s['id']]);$db->commit();
   Response::success(['session'=>$up->fetch()],$r->requestId);
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();Response::error('SAVE_ERROR',$e->getMessage(),$r->requestId,422);}
 });

 $router->post('/api/v1/tests/preparation/{id}/finish',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return;try{$db=Connection::pdo();$s=$db->prepare("select * from public.test_preparation_sessions where id=:id and user_id=:uid");$s->execute(['id'=>$p['id'],'uid'=>$r->user->id]);$session=$s->fetch();
   if(!$session){Response::error('NOT_FOUND','Session not found',$r->requestId,404);return;}
   $a=$db->prepare("select r.*,q.text as question_text,q.subject_id,q.module_id,q.topic_id,m.name as module_name,top.name as topic_name from public.test_preparation_results r join public.questions q on q.id=r.question_id left join public.modules m on m.id=q.module_id left join public.topics top on top.id=q.topic_id where r.session_id=:sid");$a->execute(['sid'=>$session['id']]);$rows=$a->fetchAll()?:[];
   $total=count($session['question_ids']);$correct=count(array_filter($rows,static fn($x)=>(bool)$x['is_correct']));$answered=count($rows);$percent=$total?round($correct/$total*100,2):0;
   $topic=[];foreach($rows as $x){$k=$x['topic_id']?:'unknown';if(!isset($topic[$k]))$topic[$k]=['topic_id'=>$x['topic_id'],'topic_name'=>$x['topic_name']?:'Без темы','total'=>0,'correct'=>0];$topic[$k]['total']++;if($x['is_correct'])$topic[$k]['correct']++;}
   foreach($topic as &$v)$v['percent']=round($v['correct']/$v['total']*100,2);unset($v);
   $u=$db->prepare("update public.test_preparation_sessions set status='completed',completed_at=now(),last_saved_at=now(),current_index=:idx where id=:id returning *");$u->execute(['idx'=>$total,'id'=>$session['id']]);
   Response::success(['session'=>$u->fetch(),'stats'=>['total'=>$total,'answered'=>$answered,'correct'=>$correct,'wrong'=>$answered-$correct,'unanswered'=>$total-$answered,'percent'=>$percent,'topics'=>array_values($topic)],'errors'=>$rows],$r->requestId);
  }catch(\Throwable $e){Response::error('FINISH_ERROR',$e->getMessage(),$r->requestId,422);}
 });
};