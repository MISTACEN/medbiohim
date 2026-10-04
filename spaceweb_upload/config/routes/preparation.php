<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Database\Connection;

return static function (Router $router): void {
 $auth=static function(Request $r):bool{return RequireAuth::handle($r);};

 $normalizeAnswerList=static function($value):array{
  if(is_array($value)){$items=$value;}
  elseif(is_string($value)){
   $decoded=json_decode($value,true);
   $items=is_array($decoded)?$decoded:[$value];
  }else{$items=[];}
  $out=[];
  foreach($items as $item){
   $s=trim((string)$item);
   if($s!=='')$out[]=mb_strtolower($s);
  }
  $out=array_values(array_unique($out));
  sort($out);
  return $out;
 };
 $isAnswerCorrect=static function(string $type,$given,$answer,$options)use($normalizeAnswerList):bool{
  if($type==='mcq'){
   $opts=is_array($options)?$options:(is_string($options)?(json_decode($options,true)?:[]):[]);
   $correct=[];
   foreach($opts as $opt){
    if(is_array($opt)&&!empty($opt['correct'])){
     $correct[]=trim((string)($opt['label']??''));
    }
   }
   if($correct){
    $givenList=$normalizeAnswerList($given);
    $correctList=$normalizeAnswerList($correct);
    return $givenList!==[] && $givenList===$correctList;
   }
  }
  return $given!==null && trim(mb_strtolower((string)$given))===trim(mb_strtolower((string)$answer));
 };


 $resolveTestId=static function(\PDO $db,string $value):?string{
  $value=trim($value);
  if($value==='')return null;
  $q=$db->prepare("select id::text from public.tests where id::text=:value or source_key=:value or source_key=:local limit 1");
  $q->execute(['value'=>$value,'local'=>'local:'.$value]);
  $id=$q->fetchColumn();
  return $id===false?null:(string)$id;
 };

 $router->post('/api/v1/tests/{id}/preparation/start',static function(Request $r,array $p)use($auth,$resolveTestId):void{
  if(!$auth($r))return;
  $testId=(string)$p['id']; $body=is_array($r->jsonBody??null)?$r->jsonBody:[];
  $requestedMode=(string)($body['mode']??'full');
  $mode=$requestedMode==='sequential'?'sequential':($requestedMode==='count'?'count':'full');
  $limit=$mode==='count'?max(1,min(200,(int)($body['question_limit']??10))):null;
  try{
   $db=Connection::pdo();
   $resolvedTestId=$resolveTestId($db,$testId);
   if($resolvedTestId===null){Response::error('NOT_FOUND','Test not found',$r->requestId,404);return;}
   $testId=$resolvedTestId;
   $q=$db->prepare("select tq.question_id from public.test_questions tq join public.questions q on q.id=tq.question_id where tq.test_id=:tid and q.is_published=true and q.archived_at is null order by tq.order_index asc,tq.question_id");
   $q->execute(['tid'=>$testId]); $ids=array_column($q->fetchAll()?:[],'question_id');
   // sequential = весь банк в исходном порядке; count/full остаются существующими режимами.
   if($mode!=='sequential') shuffle($ids);
   if($limit!==null)$ids=array_slice($ids,0,$limit);
   if(!$ids){Response::error('NO_QUESTIONS','В тесте нет опубликованных вопросов', $r->requestId,422);return;}

   // Уникальный ключ (user_id, test_id, status) — ищем ЛЮБУЮ in_progress по user+test,
   // иначе INSERT падает с 23505, если mode/limit отличаются от старой сессии.
   $s=$db->prepare("select * from public.test_preparation_sessions where user_id=:uid and test_id=:tid and status='in_progress' order by last_saved_at desc nulls last, started_at desc nulls last limit 1");
   $s->execute(['uid'=>$r->user->id,'tid'=>$testId]); $existing=$s->fetch();
   if($existing){
    // Возобновляем только тот же режим. Для «весь банк подряд» старая случайная сессия
    // не должна перехватывать запуск — она закрывается, и создаётся последовательная.
    if((string)($existing['mode']??'')!==$mode && $mode==='sequential'){
      $cancel=$db->prepare("update public.test_preparation_sessions set status='cancelled',last_saved_at=now() where id=:id");
      $cancel->execute(['id'=>$existing['id']]);
      $existing=null;
    } else {
      $existingIds=$existing['question_ids']??[];
      if(is_string($existingIds)){
        $trim=trim($existingIds);
        if($trim===''||$trim==='{}'){$existingIds=[];}
        elseif($trim[0]==='{'&&substr($trim,-1)==='}'){$inner=substr($trim,1,-1);$existingIds=$inner===''?[]:str_getcsv($inner,',','"','\\');}
        else {$existingIds=array_values(array_filter(array_map('trim',preg_split('/[,;]+/',$trim))));}
      }
      if(!is_array($existingIds))$existingIds=[];
      $existing['question_ids']=array_values(array_filter(array_map('strval',$existingIds)));
      Response::success(['session'=>$existing,'resumed'=>true],$r->requestId);return;
    }
   }

   $s=$db->prepare("insert into public.test_preparation_sessions(user_id,test_id,mode,question_limit,question_ids) values(:uid,:tid,:mode,:lim,:ids) returning *");
   $s->execute(['uid'=>$r->user->id,'tid'=>$testId,'mode'=>$mode,'lim'=>$limit,'ids'=>'{'.implode(',',array_map(static fn($x)=>'"'.$x.'"',$ids)).'}']);
   $created=$s->fetch(); if(is_array($created))$created['question_ids']=$ids;
   Response::success(['session'=>$created,'question_ids'=>$ids],$r->requestId,201);
  }catch(\Throwable $e){
   // Повторная гонка по unique — вернуть существующую сессию
   if(str_contains($e->getMessage(),'test_preparation_sessions_user_id_test_id_status_key')||str_contains($e->getMessage(),'23505')){
    try{
      $db=Connection::pdo();
      $s=$db->prepare("select * from public.test_preparation_sessions where user_id=:uid and test_id=:tid and status='in_progress' limit 1");
      $s->execute(['uid'=>$r->user->id,'tid'=>$testId]); $existing=$s->fetch();
      if($existing){Response::success(['session'=>$existing,'resumed'=>true],$r->requestId);return;}
    }catch(\Throwable $e2){}
   }
   Response::error('PREPARATION_ERROR',$e->getMessage(),$r->requestId,422);
  }
 });

 $router->get('/api/v1/tests/{id}/bank-progress',static function(Request $r,array $p)use($auth,$resolveTestId):void{
  if(!$auth($r))return;
  try{
    $db=Connection::pdo();
    $tid=$resolveTestId($db,(string)$p['id']);
    if($tid===null){Response::error('NOT_FOUND','Test not found',$r->requestId,404);return;}
    $totalQ=$db->prepare("select count(*) from public.test_questions tq join public.questions q on q.id=tq.question_id where tq.test_id=:tid and q.is_published=true and q.archived_at is null");
    $totalQ->execute(['tid'=>$tid]);$total=(int)$totalQ->fetchColumn();

    $s=$db->prepare("select * from public.test_preparation_sessions where user_id=:uid and test_id=:tid and mode='sequential' order by started_at desc limit 1");
    $s->execute(['uid'=>$r->user->id,'tid'=>$tid]);$session=$s->fetch();

    $answered=0;$correct=0;
    if($session){
      $a=$db->prepare("select count(*) total,count(*) filter(where is_correct=true) correct from public.test_preparation_results where session_id=:sid");
      $a->execute(['sid'=>$session['id']]);$row=$a->fetch()?:[];
      $answered=(int)($row['total']??0);$correct=(int)($row['correct']??0);
    }
    $completed=(bool)($session && $session['status']==='completed' && $total>0 && $answered >= $total);
    Response::success([
      'total'=>$total,
      'answered'=>$answered,
      'correct'=>$correct,
      'remaining'=>max(0,$total-$answered),
      'completed'=>$completed,
      'session'=>$session ? [
        'id'=>$session['id'],
        'status'=>$session['status'],
        'current_index'=>(int)$session['current_index'],
        'started_at'=>$session['started_at'],
        'completed_at'=>$session['completed_at']??null
      ] : null
    ],$r->requestId);
  }catch(\Throwable $e){Response::error('PROGRESS_ERROR',$e->getMessage(),$r->requestId,422);}
 });

 $router->get('/api/v1/tests/preparation/{id}',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return; try{$db=Connection::pdo();
   $s=$db->prepare("select ps.*,t.title as test_title from public.test_preparation_sessions ps join public.tests t on t.id=ps.test_id where ps.id=:id and ps.user_id=:uid");
   $s->execute(['id'=>$p['id'],'uid'=>$r->user->id]);$session=$s->fetch();
   if(!$session){Response::error('NOT_FOUND','Preparation session not found',$r->requestId,404);return;}
   $questionIds=$session['question_ids']??[];
   if(is_string($questionIds)){
    $trim=trim($questionIds);
    if($trim===''||$trim==='{}'){$questionIds=[];}
    elseif($trim[0]==='{'&&substr($trim,-1)==='}'){$inner=substr($trim,1,-1);$questionIds=$inner===''?[]:str_getcsv($inner,',','"','\\');}
    else {$questionIds=array_values(array_filter(array_map('trim',preg_split('/[,;]+/',$trim))));}
   }
   if(!is_array($questionIds))$questionIds=[];
   $questionIds=array_values(array_filter(array_map('strval',$questionIds),static fn($x)=>$x!==''));
   // modules/topics: колонка title (не name) — SQLSTATE 42703
   $q=$db->prepare("select q.id,q.text as body,q.options,q.type,q.answer,q.subject_id,q.module_id,q.topic_id,m.title as module_name,top.title as topic_name from public.questions q left join public.modules m on m.id=q.module_id left join public.topics top on top.id=q.topic_id where q.id = any(cast(:ids as uuid[]))");
   $q->execute(['ids'=>'{'.implode(',',array_map(static fn($x)=>'"'.$x.'"',$questionIds)).'}']);$questions=$q->fetchAll()?:[];
   $positions=array_flip($questionIds);
   $session['question_ids']=$questionIds;
   usort($questions,static fn($a,$b)=>(($positions[(string)$a['id']]??PHP_INT_MAX)<=>($positions[(string)$b['id']]??PHP_INT_MAX)));
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
    $ans=$db->prepare("select answer,type,options from public.questions where id=:qid");$ans->execute(['qid'=>$b['question_id']]);$row=$ans->fetch();
    $correct=$row['answer']??null;
    $type=(string)($row['type']??'open');
    $options=$row['options']??[];
    $given=array_key_exists('answer_text',$b)?(string)$b['answer_text']:null;
    $ok=$row!==false && $given!==null && $isAnswerCorrect($type,$given,$correct,$options);
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
   $a=$db->prepare("select r.*,q.text as question_text,q.subject_id,q.module_id,q.topic_id,m.title as module_name,top.title as topic_name from public.test_preparation_results r join public.questions q on q.id=r.question_id left join public.modules m on m.id=q.module_id left join public.topics top on top.id=q.topic_id where r.session_id=:sid");$a->execute(['sid'=>$session['id']]);$rows=$a->fetchAll()?:[];
   $finishIds=$session['question_ids']??[];if(is_string($finishIds)){ $finishIds=trim($finishIds);$finishIds=($finishIds!==''&&$finishIds!=='{}')?str_getcsv(substr($finishIds,1,-1),',','"','\\'):[]; }if(!is_array($finishIds))$finishIds=[];$session['question_ids']=array_values(array_filter(array_map('strval',$finishIds)));
   $total=count($session['question_ids']);$correct=count(array_filter($rows,static fn($x)=>(bool)$x['is_correct']));$answered=count($rows);$percent=$total?round($correct/$total*100,2):0;
   $topic=[];foreach($rows as $x){$k=$x['topic_id']?:'unknown';if(!isset($topic[$k]))$topic[$k]=['topic_id'=>$x['topic_id'],'topic_name'=>$x['topic_name']?:'Без темы','total'=>0,'correct'=>0];$topic[$k]['total']++;if($x['is_correct'])$topic[$k]['correct']++;}
   foreach($topic as &$v)$v['percent']=round($v['correct']/$v['total']*100,2);unset($v);
   $u=$db->prepare("update public.test_preparation_sessions set status='completed',completed_at=now(),last_saved_at=now(),current_index=:idx where id=:id returning *");$u->execute(['idx'=>$total,'id'=>$session['id']]);
   Response::success(['session'=>$u->fetch(),'stats'=>['total'=>$total,'answered'=>$answered,'correct'=>$correct,'wrong'=>$answered-$correct,'unanswered'=>$total-$answered,'percent'=>$percent,'topics'=>array_values($topic)],'errors'=>$rows],$r->requestId);
  }catch(\Throwable $e){Response::error('FINISH_ERROR',$e->getMessage(),$r->requestId,422);}
 });

 $router->post('/api/v1/tests/preparation/{id}/ai-review',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return;
  try{
   $db=Connection::pdo();
   $s=$db->prepare("select * from public.test_preparation_sessions where id=:id and user_id=:uid and status='completed'");$s->execute(['id'=>$p['id'],'uid'=>$r->user->id]);$session=$s->fetch();
   if(!$session){Response::error('NOT_FOUND','Completed preparation session not found',$r->requestId,404);return;}
   $q=$db->prepare("select r.question_id,r.answer_text,r.is_correct,q.text,q.answer,m.title as module_name,top.title as topic_name from public.test_preparation_results r join public.questions q on q.id=r.question_id left join public.modules m on m.id=q.module_id left join public.topics top on top.id=q.topic_id where r.session_id=:sid");$q->execute(['sid'=>$session['id']]);$rows=$q->fetchAll()?:[];
   if(!$rows){Response::error('NO_RESULTS','Нет ответов для AI-разбора',$r->requestId,422);return;}
   $payload=[];foreach($rows as $x)$payload[]=['question_id'=>$x['question_id'],'question'=>$x['text'],'student_answer'=>$x['answer_text'],'correct_answer'=>$x['answer'],'is_correct'=>(bool)$x['is_correct'],'module'=>$x['module_name'],'topic'=>$x['topic_name']];
   $messages=[['role'=>'system','content'=>'Ты учебный AI-аналитик. Верни только JSON с ключами summary, strengths, weak_topics, error_breakdown, recommendations, next_practice. Не придумывай факты.'],['role'=>'user','content'=>json_encode(['results'=>$payload],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]];
   $llm=\Medbiohim\Support\LlmGateway::chat($messages,\Medbiohim\Support\LlmGateway::TASK_CHAT,0.2);
   $review=json_decode(trim($llm['text']),true);if(!is_array($review))throw new \RuntimeException('AI returned invalid JSON');
   $ins=$db->prepare("insert into public.test_preparation_ai_reviews(session_id,user_id,summary,topic_breakdown,error_breakdown,recommendations,model) values(:sid,:uid,:summary,:topics,:errors,:rec,:model) returning *");
   $ins->execute(['sid'=>$session['id'],'uid'=>$r->user->id,'summary'=>(string)($review['summary']??''),'topics'=>json_encode($review['weak_topics']??[],JSON_UNESCAPED_UNICODE),'errors'=>json_encode($review['error_breakdown']??[],JSON_UNESCAPED_UNICODE),'rec'=>json_encode(['strengths'=>$review['strengths']??[],'recommendations'=>$review['recommendations']??[],'next_practice'=>$review['next_practice']??[]],JSON_UNESCAPED_UNICODE),'model'=>$llm['model']??null]);
   Response::success(['review'=>$review,'model'=>$llm['model']??null],$r->requestId);
  }catch(\Throwable $e){Response::error('AI_REVIEW_ERROR',$e->getMessage(),$r->requestId,503);}
 });

};
