<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Database\Connection;
use Medbiohim\Services\AcademicContextResolver;
use Medbiohim\Services\AcademicContextException;
use Medbiohim\Services\AnswerGradingService;

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
  $q=$db->prepare("select id::text from public.tests where is_published=true and (id::text=:value or source_key=:value or source_key=:local) limit 1");
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
   $groupId=trim((string)($body['group_id']??''));
   $context=(new AcademicContextResolver($db))->resolveGroup($r->user->id,$groupId!==''?$groupId:null);
   $subjectQ=$db->prepare("select subject_id from public.tests where id=:tid and is_published=true limit 1");
   $subjectQ->execute(['tid'=>$testId]);
   $subjectId=$subjectQ->fetchColumn();
   $academicContext=null;
   if($subjectId!==false && $subjectId!==null) {
    $academicContext=(new AcademicContextResolver($db))->resolveForRequest($r->user->id,(string)$context['group_id'],(string)$subjectId);
   }
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
    if((string)($existing['group_id']??'')!=='' && (string)$existing['group_id']!==(string)$context['group_id']){
      Response::error('CONTEXT_CHANGED','Сессия подготовки относится к другой учебной группе',$r->requestId,409);
      return;
    }
    if((string)($existing['context_version']??'')!=='' && $academicContext!==null && (string)$existing['context_version']!==(string)$academicContext['context_version']){
      Response::error('CONTEXT_CHANGED','Учебный контекст изменился; начните новую подготовку',$r->requestId,409);
      return;
    }
    // Возобновляем только тот же режим. Для «весь банк подряд» старая случайная сессия
    // не должна перехватывать запуск — она закрывается, и создаётся последовательная.
    if((string)($existing['mode']??'')!==$mode && $mode==='sequential'){
      $cancel=$db->prepare("update public.test_preparation_sessions set status='abandoned',last_saved_at=now() where id=:id");
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
      unset($existing['question_snapshot']);
      Response::success(['session'=>$existing,'resumed'=>true],$r->requestId);return;
    }
   }

   $snapshotQ=$db->prepare("select q.id,q.subject_id,q.module_id,q.topic_id,q.type,q.text,q.answer,q.options,m.title as module_name,top.title as topic_name from public.questions q left join public.modules m on m.id=q.module_id left join public.topics top on top.id=q.topic_id where q.id=any(cast(:ids as uuid[])) order by q.id");
   $snapshotQ->execute(['ids'=>'{'.implode(',',array_map(static fn($x)=>'"'.$x.'"',$ids)).'}']);
   $questionSnapshot=$snapshotQ->fetchAll()?:[];
   foreach($questionSnapshot as &$snap) if(is_string($snap['options']??null)) $snap['options']=json_decode($snap['options'],true)?:[];
   unset($snap);
   $s=$db->prepare("insert into public.test_preparation_sessions(user_id,test_id,mode,question_limit,question_ids,group_id,session_id,context_version,question_snapshot) values(:uid,:tid,:mode,:lim,:ids,:gid,:sid,:cv,:snapshot) returning *");
   $s->execute(['uid'=>$r->user->id,'tid'=>$testId,'mode'=>$mode,'lim'=>$limit,'ids'=>'{'.implode(',',array_map(static fn($x)=>'"'.$x.'"',$ids)).'}','gid'=>$context['group_id'],'sid'=>$academicContext['session_id']??null,'cv'=>$academicContext['context_version']??null,'snapshot'=>json_encode($questionSnapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
   $created=$s->fetch(); if(is_array($created)){$created['question_ids']=$ids;unset($created['question_snapshot']);}
   Response::success(['session'=>$created,'question_ids'=>$ids],$r->requestId,201);
  }catch(AcademicContextException $e){
   Response::error($e->errorCode,$e->getMessage(),$r->requestId,$e->httpStatus,$e->details);
  }catch(\Throwable $e){
   // Повторная гонка по unique — вернуть существующую сессию
   if(str_contains($e->getMessage(),'test_preparation_sessions_user_id_test_id_status_key')||str_contains($e->getMessage(),'23505')){
    try{
      $db=Connection::pdo();
      $s=$db->prepare("select * from public.test_preparation_sessions where user_id=:uid and test_id=:tid and status='in_progress' limit 1");
      $s->execute(['uid'=>$r->user->id,'tid'=>$testId]); $existing=$s->fetch();
      if($existing){unset($existing['question_snapshot']);Response::success(['session'=>$existing,'resumed'=>true],$r->requestId);return;}
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
    $groupId=trim((string)($r->query['group_id']??''));
    $testSubjectQ=$db->prepare("select subject_id from public.tests where id=:tid and is_published=true limit 1");
    $testSubjectQ->execute(['tid'=>$tid]); $testSubject=$testSubjectQ->fetchColumn();
    $context=(new AcademicContextResolver($db))->resolveForRequest($r->user->id,$groupId!==''?$groupId:null,$testSubject!==false?(string)$testSubject:null);
    $totalQ=$db->prepare("select count(*) from public.test_questions tq join public.questions q on q.id=tq.question_id where tq.test_id=:tid and q.is_published=true and q.archived_at is null");
    $totalQ->execute(['tid'=>$tid]);$total=(int)$totalQ->fetchColumn();

    $s=$db->prepare("select * from public.test_preparation_sessions where user_id=:uid and test_id=:tid and group_id=:gid and mode='sequential' order by started_at desc limit 1");
    $s->execute(['uid'=>$r->user->id,'tid'=>$tid,'gid'=>$context['group_id']]);$session=$s->fetch();

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
        'group_id'=>$session['group_id']??null,
        'session_id'=>$session['session_id']??null,
        'context_version'=>$session['context_version']??null,
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
   // Историческая сессия читается из immutable question_snapshot, а не из текущих questions.
   $snapshot=$session['question_snapshot']??[];
   if(is_string($snapshot))$snapshot=json_decode($snapshot,true)?:[];
   if(!is_array($snapshot))$snapshot=[];
   $byId=[];
   foreach($snapshot as $snap){
    if(is_array($snap)&&isset($snap['id']))$byId[(string)$snap['id']]=$snap;
   }
   $positions=array_flip($questionIds);
   $session['question_ids']=$questionIds;
   $questions=[];
   foreach($questionIds as $qid){
    $snap=$byId[(string)$qid]??null;
    if(!is_array($snap))continue;
    $opts=$snap['options']??[];
    if(is_string($opts))$opts=json_decode($opts,true)?:[];
    $clean=[];$correctCount=0;
    foreach(is_array($opts)?$opts:[] as $opt){
     if(is_array($opt)){
      if(!empty($opt['correct']))$correctCount++;
      $clean[]=$session['status']==='completed'
        ? ['label'=>(string)($opt['label']??''),'correct'=>!empty($opt['correct'])]
        : ['label'=>(string)($opt['label']??'')];
     } else $clean[]=['label'=>(string)$opt];
    }
    $questions[]=[
      'id'=>(string)$snap['id'],
      'body'=>(string)($snap['text']??$snap['body']??''),
      'text'=>(string)($snap['text']??$snap['body']??''),
      'options'=>$clean,
      'type'=>(string)($snap['type']??'open'),
      'subject_id'=>$snap['subject_id']??null,
      'module_id'=>$snap['module_id']??null,
      'topic_id'=>$snap['topic_id']??null,
      'module_name'=>$snap['module_name']??null,
      'topic_name'=>$snap['topic_name']??null,
      'allow_multiple'=>$correctCount>1,
    ];
    if($session['status']==='completed')$questions[array_key_last($questions)]['answer']=$snap['answer']??null;
   }
   $a=$db->prepare("select question_id,answer_text,grading_status,grading_source,grading_confidence,grading_feedback,grading_model,graded_at".($session['status']==='completed'?",is_correct,score":"")." from public.test_preparation_results where session_id=:sid");
   $a->execute(['sid'=>$session['id']]);$answers=$a->fetchAll()?:[];
   unset($session['question_snapshot']);
   Response::success(['session'=>$session,'questions'=>$questions,'answers'=>$answers],$r->requestId);
  }catch(\Throwable $e){Response::error('PREPARATION_ERROR',$e->getMessage(),$r->requestId,422);}
 });

 $router->patch('/api/v1/tests/preparation/{id}',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return;
  $b=is_array($r->jsonBody??null)?$r->jsonBody:[];
  try{
   $db=Connection::pdo();
   $check=$db->prepare("select * from public.test_preparation_sessions where id=:id and user_id=:uid and status='in_progress'");
   $check->execute(['id'=>$p['id'],'uid'=>$r->user->id]);
   $s=$check->fetch();
   if(!$s){Response::error('NOT_FOUND','Session not found',$r->requestId,404);return;}

   $idx=array_key_exists('current_index',$b)?max(0,(int)$b['current_index']):(int)$s['current_index'];
   $sessionCount=is_array($s['question_ids']??null)?count($s['question_ids']):0;
   if($sessionCount===0 && is_string($s['question_ids']??null)) $sessionCount=count(array_filter(str_getcsv(trim($s['question_ids'],'{}'),',','"','\\')));
   if($sessionCount>0) $idx=min($idx,$sessionCount-1);

   $grading=null;
   if(isset($b['question_id'])){
    $membership=$db->prepare("select 1 from public.test_preparation_sessions where id=:sid and :qid = any(question_ids)");
    $membership->execute(['sid'=>$s['id'],'qid'=>(string)$b['question_id']]);
    if(!$membership->fetchColumn()){Response::error('QUESTION_NOT_IN_SESSION','Вопрос не входит в эту сессию',$r->requestId,422);return;}

    $snapshot=$s['question_snapshot']??[];
    if(is_string($snapshot))$snapshot=json_decode($snapshot,true)?:[];
    $row=null;
    foreach(is_array($snapshot)?$snapshot:[] as $snap){if((string)($snap['id']??'')===(string)$b['question_id']){$row=$snap;break;}}
    if($row===null){Response::error('QUESTION_NOT_IN_SESSION','Вопрос не входит в эту сессию',$r->requestId,422);return;}
    $given=array_key_exists('answer_text',$b)?(string)$b['answer_text']:null;

    // AI grading happens outside the DB transaction.
    $grading=AnswerGradingService::grade($row,$given);
   }

   $db->beginTransaction();
   $lock=$db->prepare("select * from public.test_preparation_sessions where id=:id and user_id=:uid and status='in_progress' for update");
   $lock->execute(['id'=>$p['id'],'uid'=>$r->user->id]);
   $locked=$lock->fetch();
   if(!$locked){$db->rollBack();Response::error('NOT_FOUND','Session not found',$r->requestId,404);return;}

   if(isset($b['question_id'])){
    $up=$db->prepare("insert into public.test_preparation_results(session_id,user_id,test_id,question_id,answer_text,is_correct,score,answer_snapshot,grading_status,grading_source,grading_confidence,grading_feedback,grading_model,graded_at)
      values(:sid,:uid,:tid,:qid,:a,:ok,:score,:snapshot,:status,:source,:confidence,:feedback,:model,:graded_at)
      on conflict(session_id,question_id) do update set answer_text=excluded.answer_text,is_correct=excluded.is_correct,score=excluded.score,answer_snapshot=excluded.answer_snapshot,grading_status=excluded.grading_status,grading_source=excluded.grading_source,grading_confidence=excluded.grading_confidence,grading_feedback=excluded.grading_feedback,grading_model=excluded.grading_model,graded_at=excluded.graded_at,answered_at=now()");
    $up->execute([
      'sid'=>$locked['id'],'uid'=>$r->user->id,'tid'=>$locked['test_id'],'qid'=>$b['question_id'],'a'=>$given,
      'ok'=>$grading['is_correct'],'score'=>$grading['score'],
      'snapshot'=>json_encode(['type'=>$row['type']??'open','answer'=>$row['answer']??null,'options'=>$row['options']??[]],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
      'status'=>$grading['grading_status'],'source'=>$grading['grading_source'],'confidence'=>$grading['confidence'],
      'feedback'=>$grading['feedback'],'model'=>$grading['model'],
      'graded_at'=>in_array($grading['grading_status'],['deterministic','ai'],true)?date('c'):null
    ]);
   }

   $up=$db->prepare("update public.test_preparation_sessions set current_index=:idx,last_saved_at=now() where id=:id returning *");
   $up->execute(['idx'=>$idx,'id'=>$locked['id']]);
   $savedSession=$up->fetch();
   if(is_array($savedSession))unset($savedSession['question_snapshot']);
   $db->commit();
   Response::success(['session'=>$savedSession,'grading'=>$grading],$r->requestId);
  }catch(\Throwable $e){
   if(isset($db)&&$db instanceof \PDO && $db->inTransaction())$db->rollBack();
   Response::error('SAVE_ERROR',$e->getMessage(),$r->requestId,422);
  }
 });
 
 $router->post('/api/v1/tests/preparation/{id}/finish',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return;
  try{
   $db=Connection::pdo();
   $s=$db->prepare("select * from public.test_preparation_sessions where id=:id and user_id=:uid and status='in_progress'");
   $s->execute(['id'=>$p['id'],'uid'=>$r->user->id]);$session=$s->fetch();
   if(!$session){Response::error('INVALID_TRANSITION','Сессию можно завершить только из состояния in_progress',$r->requestId,404);return;}

   $snapshot=$session['question_snapshot']??[];
   if(is_string($snapshot))$snapshot=json_decode($snapshot,true)?:[];
   if(!is_array($snapshot))$snapshot=[];
   $snapshotById=[];
   foreach($snapshot as $snap)if(is_array($snap)&&isset($snap['id']))$snapshotById[(string)$snap['id']]=$snap;
   $finishIds=$session['question_ids']??[];
   if(is_string($finishIds)){
    $finishIds=trim($finishIds);
    $finishIds=($finishIds!==''&&$finishIds!=='{}')?str_getcsv(substr($finishIds,1,-1),',','"','\\'):[]; 
   }
   if(!is_array($finishIds))$finishIds=[];
   $finishIds=array_values(array_filter(array_map('strval',$finishIds)));
   $a=$db->prepare("select * from public.test_preparation_results where session_id=:sid");
   $a->execute(['sid'=>$session['id']]);$rows=$a->fetchAll()?:[];
   $rowsById=[];foreach($rows as $row)$rowsById[(string)$row['question_id']]=$row;
   $pending=array_values(array_filter($rows,static fn($row)=>in_array((string)($row['grading_status']??'deterministic'),['pending','error'],true)));
   if($pending){Response::error('AI_GRADING_PENDING','Не все открытые ответы удалось надёжно проверить. Повторите сохранение этих ответов и завершите попытку ещё раз.',$r->requestId,409,['pending_count'=>count($pending)]);return;}

   $total=count($finishIds);$answered=count($rows);$correct=0;$topic=[];
   foreach($finishIds as $qid){
    $snap=$snapshotById[$qid]??[];
    $row=$rowsById[$qid]??null;
    if($row && (bool)$row['is_correct'])$correct++;
    $topicId=$snap['topic_id']??'unknown';
    $topicName=$snap['topic_name']??'Без темы';
    if(!isset($topic[$topicId]))$topic[$topicId]=['topic_id'=>$snap['topic_id']??null,'topic_name'=>$topicName,'total'=>0,'correct'=>0];
    $topic[$topicId]['total']++;
    if($row && (bool)$row['is_correct'])$topic[$topicId]['correct']++;
   }
   foreach($topic as &$v)$v['percent']=$v['total']?round($v['correct']/$v['total']*100,2):0;
   unset($v);
   $percent=$total?round($correct/$total*100,2):0;
   $u=$db->prepare("update public.test_preparation_sessions set status='completed',completed_at=now(),last_saved_at=now(),current_index=:idx where id=:id returning *");
   $u->execute(['idx'=>$total,'id'=>$session['id']]);
   $completedSession=$u->fetch();
   if(is_array($completedSession))unset($completedSession['question_snapshot']);
   Response::success([
    'session'=>$completedSession,
    'stats'=>['total'=>$total,'answered'=>$answered,'correct'=>$correct,'wrong'=>max(0,$answered-$correct),'unanswered'=>max(0,$total-$answered),'percent'=>$percent,'topics'=>array_values($topic)],
    'errors'=>$rows
   ],$r->requestId);
  }catch(\Throwable $e){Response::error('FINISH_ERROR',$e->getMessage(),$r->requestId,422);}
 });

 $router->post('/api/v1/tests/preparation/{id}/ai-review',static function(Request $r,array $p)use($auth):void{
  if(!$auth($r))return;
  try{
   $db=Connection::pdo();
   $s=$db->prepare("select * from public.test_preparation_sessions where id=:id and user_id=:uid and status='completed'");
   $s->execute(['id'=>$p['id'],'uid'=>$r->user->id]);$session=$s->fetch();
   if(!$session){Response::error('NOT_FOUND','Completed preparation session not found',$r->requestId,404);return;}

   $snapshot=$session['question_snapshot']??[];
   if(is_string($snapshot))$snapshot=json_decode($snapshot,true)?:[];
   if(!is_array($snapshot))$snapshot=[];
   $snapshotById=[];foreach($snapshot as $snap)if(is_array($snap)&&isset($snap['id']))$snapshotById[(string)$snap['id']]=$snap;

   $q=$db->prepare("select * from public.test_preparation_results where session_id=:sid");
   $q->execute(['sid'=>$session['id']]);$rows=$q->fetchAll()?:[];
   if(!$rows){Response::error('NO_RESULTS','Нет ответов для AI-разбора',$r->requestId,422);return;}
   $payload=[];
   foreach($rows as $x){
    $snap=$snapshotById[(string)$x['question_id']]??[];
    $storedAnswer=$x['answer_snapshot']??null;
    $answerSnapshot=is_string($storedAnswer)?json_decode($storedAnswer,true):$storedAnswer;
    if(!is_array($answerSnapshot))$answerSnapshot=[];
    $payload[]=[
      'question_id'=>$x['question_id'],
      'question'=>$snap['text']??$snap['body']??'',
      'student_answer'=>$x['answer_text'],
      'correct_answer'=>$answerSnapshot['answer']??($snap['answer']??null),
      'is_correct'=>(bool)$x['is_correct'],
      'module'=>$snap['module_name']??null,
      'topic'=>$snap['topic_name']??null
    ];
   }
   $messages=[
    ['role'=>'system','content'=>'Ты учебный AI-аналитик. Верни только JSON с ключами summary, strengths, weak_topics, error_breakdown, recommendations, next_practice. Не придумывай факты.'],
    ['role'=>'user','content'=>json_encode(['results'=>$payload],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]
   ];
   $llm=\Medbiohim\Support\LlmGateway::chat($messages,\Medbiohim\Support\LlmGateway::TASK_CHAT,0.2);
   $review=json_decode(trim($llm['text']),true);if(!is_array($review))throw new \RuntimeException('AI returned invalid JSON');
   $ins=$db->prepare("insert into public.test_preparation_ai_reviews(session_id,user_id,summary,topic_breakdown,error_breakdown,recommendations,model) values(:sid,:uid,:summary,:topics,:errors,:rec,:model) returning *");
   $ins->execute([
    'sid'=>$session['id'],'uid'=>$r->user->id,'summary'=>(string)($review['summary']??''),
    'topics'=>json_encode($review['weak_topics']??[],JSON_UNESCAPED_UNICODE),
    'errors'=>json_encode($review['error_breakdown']??[],JSON_UNESCAPED_UNICODE),
    'rec'=>json_encode(['strengths'=>$review['strengths']??[],'recommendations'=>$review['recommendations']??[],'next_practice'=>$review['next_practice']??[]],JSON_UNESCAPED_UNICODE),
    'model'=>$llm['model']??null
   ]);
   Response::success(['review'=>$review,'model'=>$llm['model']??null],$r->requestId);
  }catch(\Throwable $e){Response::error('AI_REVIEW_ERROR',$e->getMessage(),$r->requestId,503);}
 });

};
