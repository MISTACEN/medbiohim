<?php
declare(strict_types=1);
use Medbiohim\Http\Request;use Medbiohim\Http\Response;use Medbiohim\Http\Router;use Medbiohim\Middleware\RequireAuth;use Medbiohim\Middleware\RequireRole;use Medbiohim\Repositories\GroupRepository;use Medbiohim\Repositories\FileRepository;use Medbiohim\Repositories\HomeworkRepository;use Medbiohim\Repositories\SubjectRepository;use Medbiohim\Repositories\TestRepository;use Medbiohim\Repositories\UserRepository;use Medbiohim\Support\ContentStore;use Medbiohim\Support\Env;use Medbiohim\Services\SupabaseAuth;use Medbiohim\Services\SupabaseRest;
return static function(Router $router):void{
$adminGate=static function(Request $req):bool{if(!RequireAuth::handle($req))return false;return RequireRole::handle($req,['admin','moderator','teacher']);};$strictAdmin=static function(Request $req):bool{if(!RequireAuth::handle($req))return false;return RequireRole::handle($req,['admin']);};
$router->get('/api/v1/site', static function (Request $req, array $params): void {
    try {
        $store = new ContentStore();
        Response::success([
            'site' => $store->getSite(),
            'announcements' => $store->listAnnouncements(),
        ], $req->requestId);
    } catch (\Throwable $e) {
        Response::success([
            'site' => ['title' => 'Медбиохим', 'subtitle' => 'Учебная платформа'],
            'announcements' => [],
            'note' => $e->getMessage(),
        ], $req->requestId);
    }
});
$router->post('/api/v1/admin/claim-admin',static function(Request $req,array $params):void{if(!RequireAuth::handle($req))return;$secret=trim((string)$req->json('secret',''));$expected=trim((string)Env::get('ADMIN_BOOTSTRAP_SECRET',''));if($expected===''||!hash_equals($expected,$secret)){Response::error('FORBIDDEN','Invalid bootstrap secret',$req->requestId,403);return;}try{$repo=new UserRepository();$repo->assignRole($req->user->id,'admin');$roles=$repo->roleCodesForUser($req->user->id);try{(new SupabaseAuth())->setAppRole($req->user->id,'admin');}catch(\Throwable $e){}Response::success(['roles'=>$roles,'message'=>'Admin role assigned','session_refresh_required'=>true],$req->requestId);}catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}});
$router->get('/api/v1/admin/users',static function(Request $req,array $params)use($strictAdmin):void{if(!$strictAdmin($req))return;try{Response::success(['items'=>(new UserRepository())->listUsers(100)],$req->requestId);}catch(\Throwable $e){try{Response::success(['items'=>SupabaseRest::listUsers(100)],$req->requestId);}catch(\Throwable $x){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}}});
$router->post('/api/v1/admin/users/roles',static function(Request $req,array $params)use($strictAdmin):void{if(!$strictAdmin($req))return;$userId=trim((string)$req->json('user_id',''));$role=trim((string)$req->json('role',''));$action=trim((string)$req->json('action','assign'));if($userId===''||$role===''){Response::error('VALIDATION_ERROR','user_id and role required',$req->requestId,422);return;}if(!in_array($role,['admin','moderator','teacher','student'],true)){Response::error('VALIDATION_ERROR','invalid role',$req->requestId,422);return;}try{$repo=new UserRepository();if($action==='revoke'){if($role==='admin'&&$userId===$req->user->id&&$repo->countWithRole('admin')<=1){Response::error('LAST_ADMIN','Cannot revoke the last administrator role.',$req->requestId,409);return;}$repo->revokeRole($userId,$role);}else{$repo->assignRole($userId,$role);}$roles=$repo->roleCodesForUser($userId);if($role==='admin')(new SupabaseAuth())->setAppRole($userId,in_array('admin',$roles,true)?'admin':null);Response::success(['roles'=>$roles,'session_refresh_required'=>$userId===$req->user->id&&$role==='admin'],$req->requestId);}catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}});
$router->get('/api/v1/admin/overview',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;try{$store=new ContentStore();$groups=$subjects=0;$anns=$sched=$tests=$curr=0;try{$groups=count((new GroupRepository())->listActive());}catch(\Throwable $e){}try{$subjects=count((new SubjectRepository())->listActive(null,null));}catch(\Throwable $e){}try{$anns=count($store->listAnnouncements());}catch(\Throwable $e){}try{$sched=count($store->listSchedule());}catch(\Throwable $e){}try{$tests=count($store->listTestsLocal());}catch(\Throwable $e){}try{$curr=count($store->listCurriculum());}catch(\Throwable $e){}Response::success(['site'=>$store->getSite(),'counts'=>['announcements'=>$anns,'groups'=>$groups,'subjects'=>$subjects,'schedule'=>$sched,'tests_local'=>$tests,'curriculum'=>$curr]],$req->requestId);}catch(\Throwable $e){Response::success(['site'=>['title'=>'Медбиохим'],'counts'=>['announcements'=>0,'groups'=>0,'subjects'=>0,'schedule'=>0,'tests_local'=>0,'curriculum'=>0],'note'=>$e->getMessage()],$req->requestId);}});
$router->put('/api/v1/admin/site',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;$store=new ContentStore();Response::success(['site'=>$store->updateSite($req->jsonBody??[])],$req->requestId);});
$router->get('/api/v1/admin/announcements',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;Response::success(['items'=>(new ContentStore())->listAnnouncements()],$req->requestId);});
$router->post('/api/v1/admin/announcements',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;$title=trim((string)$req->json('title',''));$body=trim((string)$req->json('body',''));if($title===''||$body===''){Response::error('VALIDATION_ERROR','title and body required',$req->requestId,422);return;}Response::success(['item'=>(new ContentStore())->createAnnouncement(['title'=>$title,'body'=>$body,'pinned'=>(bool)$req->json('pinned',false)])],$req->requestId,201);});
$router->delete('/api/v1/admin/announcements/{id}',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;$ok=(new ContentStore())->deleteAnnouncement($params['id']);Response::success(['deleted'=>$ok],$req->requestId);});
$router->get('/api/v1/admin/homeworks',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;try{Response::success(['items'=>(new HomeworkRepository())->listAllAdmin()],$req->requestId);}catch(\Throwable $e){Response::success(['items'=>[]],$req->requestId);}});
$router->post('/api/v1/admin/homeworks',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;try{Response::success(['item'=>(new HomeworkRepository())->create($req->jsonBody??[])],$req->requestId,201);}catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}});
$router->delete('/api/v1/admin/homeworks/{id}',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;try{(new HomeworkRepository())->delete($params['id']);Response::success(['deleted'=>true],$req->requestId);}catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}});
$router->get('/api/v1/admin/materials',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;try{Response::success(['items'=>(new FileRepository())->listActive(null)],$req->requestId);}catch(\Throwable $e){Response::success(['items'=>[]],$req->requestId);}});
$router->delete('/api/v1/admin/materials/{id}',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;try{(new FileRepository())->softDelete($params['id']);Response::success(['deleted'=>true],$req->requestId);}catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}});
$router->get('/api/v1/admin/community',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req))return;Response::success(['items'=>(new ContentStore())->listCommunityPosts()],$req->requestId);});
$router->patch('/api/v1/admin/community/{id}',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req)||!RequireRole::handle($req,['admin','moderator']))return;$patch=[];if($req->jsonBody!==null)foreach(['title','body','pinned','hidden'] as $k)if(array_key_exists($k,$req->jsonBody))$patch[$k]=$req->jsonBody[$k];$row=(new ContentStore())->updateCommunityPost($params['id'],$patch);if($row===null){Response::error('NOT_FOUND','Post not found',$req->requestId,404);return;}Response::success(['post'=>$row],$req->requestId);});
$router->delete('/api/v1/admin/community/{id}',static function(Request $req,array $params)use($adminGate):void{if(!$adminGate($req)||!RequireRole::handle($req,['admin','moderator']))return;$ok=(new ContentStore())->deleteCommunityPost($params['id']);if(!$ok){Response::error('NOT_FOUND','Post not found',$req->requestId,404);return;}Response::success(['deleted'=>true],$req->requestId);});

/**
 * Generic admin data grid. Deliberately whitelist tables and never exposes arbitrary SQL.
 * The UI uses this for the Excel-like editor and CSV/JSON import/export.
 */
$adminGridTables = [
    'subjects','groups','group_memberships','modules','topics','materials',
    'questions','tests','test_questions','test_attempts','test_answers',
    'homeworks','homework_progress','homework_submissions','schedules',
    'schedule_entries','academic_sessions','curriculum_items','student_academic_states','academic_progress_history','ai_study_plans','ai_study_plan_items','community_posts','comments','notes','favorites',
    'exam_questions','ticket_banks','progress_ledger','site_content','learning_sessions'
];
$adminGridGate = static function(Request $req)use($strictAdmin):bool{return $strictAdmin($req);};

$adminKeyMap=['test_questions'=>['test_id','question_id'],'favorites'=>['user_id','target_type','target_id'],'site_content'=>['key'],'group_memberships'=>['group_id','user_id'],'user_roles'=>['user_id','role_id'],'test_answers'=>['attempt_id','question_id'],'homework_progress'=>['homework_id','user_id']];
$router->get('/api/v1/admin/db/meta',static function(Request $req,array $params)use($adminGridGate,$adminGridTables,$adminKeyMap):void{
 if(!$adminGridGate($req))return;$items=[];
 foreach($adminGridTables as $t){try{$cols=SupabaseRest::select('information_schema_columns_not_exposed');$rows=SupabaseRest::select($t.'?select=*&limit=1');$columns=$rows?array_keys($rows[0]):[];$items[]=['name'=>$t,'items'=>count(SupabaseRest::select($t.'?select=*&limit=10000')),'primary_key'=>$adminKeyMap[$t]??['id'],'columns'=>$columns];}catch(\Throwable $e){$items[]=['name'=>$t,'items'=>null,'primary_key'=>$adminKeyMap[$t]??['id'],'columns'=>[],'error'=>$e->getMessage()];}}
 Response::success(['items'=>$items],$req->requestId);
});
$router->patch('/api/v1/admin/db/{table}/row',static function(Request $req,array $params)use($adminGridGate,$adminGridTables,$adminKeyMap):void{
 if(!$adminGridGate($req))return;$table=(string)$params['table'];if(!in_array($table,$adminGridTables,true)){Response::error('FORBIDDEN','Table is not available',$req->requestId,403);return;}
 $p=is_array($req->jsonBody??null)?$req->jsonBody:[];$key=is_array($p['key']??null)?$p['key']:[];$row=is_array($p['row']??null)?$p['row']:[];$keys=$adminKeyMap[$table]??['id'];foreach($keys as $k)if(!array_key_exists($k,$key)||$key[$k]===''){Response::error('VALIDATION_ERROR','Missing key: '.$k,$req->requestId,422);return;}
 try{$filters=[];foreach($key as $k=>$v)$filters[]=$k.'=eq.'.rawurlencode((string)$v);$old=SupabaseRest::select($table.'?select=*&'.implode('&',$filters));if(!$old){Response::error('NOT_FOUND','Row not found',$req->requestId,404);return;}$new=SupabaseRest::patch($table.'?'.implode('&',$filters),$row,true);SupabaseRest::insert('admin_change_log',['actor_user_id'=>$req->user->id,'action'=>'update','table_name'=>$table,'row_key'=>$key,'old_data'=>$old[0],'new_data'=>$new[0]??array_merge($old[0],$row),'source'=>'admin_ui'],false);Response::success(['item'=>$new[0]??array_merge($old[0],$row)],$req->requestId);
 }catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,422);}
});
$router->delete('/api/v1/admin/db/{table}/row',static function(Request $req,array $params)use($adminGridGate,$adminGridTables,$adminKeyMap):void{
 if(!$adminGridGate($req))return;$table=(string)$params['table'];if(!in_array($table,$adminGridTables,true)){Response::error('FORBIDDEN','Table is not available',$req->requestId,403);return;}
 $p=is_array($req->jsonBody??null)?$req->jsonBody:[];$key=is_array($p['key']??null)?$p['key']:[];$keys=$adminKeyMap[$table]??['id'];foreach($keys as $k)if(!array_key_exists($k,$key)||$key[$k]===''){Response::error('VALIDATION_ERROR','Missing key: '.$k,$req->requestId,422);return;}
 try{$filters=[];foreach($key as $k=>$v)$filters[]=$k.'=eq.'.rawurlencode((string)$v);$old=SupabaseRest::select($table.'?select=*&'.implode('&',$filters));if(!$old){Response::error('NOT_FOUND','Row not found',$req->requestId,404);return;}SupabaseRest::deleteWhere($table.'?'.implode('&',$filters));SupabaseRest::insert('admin_change_log',['actor_user_id'=>$req->user->id,'action'=>'delete','table_name'=>$table,'row_key'=>$key,'old_data'=>$old[0],'new_data'=>null,'source'=>'admin_ui'],false);Response::success(['deleted'=>true],$req->requestId);
 }catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,422);}
});
$router->get('/api/v1/admin/db/audit',static function(Request $req,array $params)use($strictAdmin):void{
 if(!$strictAdmin($req))return;$limit=min(500,max(1,(int)($req->query['limit']??200)));try{Response::success(['items'=>SupabaseRest::select('admin_change_log?select=*&order=created_at.desc&limit='.$limit)],$req->requestId);}catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}
});
$router->get('/api/v1/admin/db/tables', static function(Request $req,array $params)use($adminGridGate,$adminGridTables):void{
    if(!$adminGridGate($req))return;
    $items=[];
    foreach($adminGridTables as $t){
        try{$items[]=['name'=>$t,'items'=>count(SupabaseRest::select($t.'?select=*&limit=10000'))];}
        catch(\Throwable $e){$items[]=['name'=>$t,'items'=>null,'error'=>$e->getMessage()];}
    }
    Response::success(['items'=>$items],$req->requestId);
});

$router->get('/api/v1/admin/db/{table}', static function(Request $req,array $params)use($adminGridGate,$adminGridTables):void{
    if(!$adminGridGate($req))return;
    $table=(string)($params['table']??'');
    if(!in_array($table,$adminGridTables,true)){Response::error('FORBIDDEN','Table is not available in admin grid',$req->requestId,403);return;}
    $limit=min(500,(int)($req->query['limit']??200)); if($limit<1)$limit=200;
    try{Response::success(['items'=>SupabaseRest::select($table.'?select=*&limit='.$limit)],$req->requestId);}
    catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}
});

$router->post('/api/v1/admin/db/{table}', static function(Request $req,array $params)use($adminGridGate,$adminGridTables):void{
    if(!$adminGridGate($req))return;
    $table=(string)($params['table']??'');
    if(!in_array($table,$adminGridTables,true)){Response::error('FORBIDDEN','Table is not available in admin grid',$req->requestId,403);return;}
    $row=is_array($req->jsonBody??null)?$req->jsonBody:[];
    unset($row['id']);
    try{$item=SupabaseRest::insert($table,$row,true)[0]??$row;SupabaseRest::insert('admin_change_log',['actor_user_id'=>$req->user->id,'action'=>'insert','table_name'=>$table,'row_key'=>['id'=>$item['id']??null],'old_data'=>null,'new_data'=>$item,'source'=>'admin_ui'],false);Response::success(['item'=>$item],$req->requestId,201);}
    catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,422);}
});

$router->patch('/api/v1/admin/db/{table}/{id}', static function(Request $req,array $params)use($adminGridGate,$adminGridTables):void{
    if(!$adminGridGate($req))return;
    $table=(string)($params['table']??''); $id=(string)($params['id']??'');
    if(!in_array($table,$adminGridTables,true)||$id===''){Response::error('FORBIDDEN','Invalid table or id',$req->requestId,403);return;}
    $row=is_array($req->jsonBody??null)?$req->jsonBody:[]; unset($row['id']);
    try{$old=SupabaseRest::select($table.'?id=eq.'.rawurlencode($id).'&limit=1');$x=SupabaseRest::patch($table.'?id=eq.'.rawurlencode($id),$row,true);$item=$x[0]??array_merge(['id'=>$id],$row);SupabaseRest::insert('admin_change_log',['actor_user_id'=>$req->user->id,'action'=>'update','table_name'=>$table,'row_key'=>['id'=>$id],'old_data'=>$old[0]??null,'new_data'=>$item,'source'=>'admin_ui'],false);Response::success(['item'=>$item],$req->requestId);}
    catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,422);}
});

$router->delete('/api/v1/admin/db/{table}/{id}', static function(Request $req,array $params)use($adminGridGate,$adminGridTables):void{
    if(!$adminGridGate($req))return;
    $table=(string)($params['table']??''); $id=(string)($params['id']??'');
    if(!in_array($table,$adminGridTables,true)||$id===''){Response::error('FORBIDDEN','Invalid table or id',$req->requestId,403);return;}
    try{$old=SupabaseRest::select($table.'?id=eq.'.rawurlencode($id).'&limit=1');SupabaseRest::deleteWhere($table.'?id=eq.'.rawurlencode($id));SupabaseRest::insert('admin_change_log',['actor_user_id'=>$req->user->id,'action'=>'delete','table_name'=>$table,'row_key'=>['id'=>$id],'old_data'=>$old[0]??null,'new_data'=>null,'source'=>'admin_ui'],false);Response::success(['deleted'=>true],$req->requestId);}
    catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,422);}
});


$router->post('/api/v1/admin/content/import', static function(Request $req,array $params)use($adminGridGate):void{
    if(!$adminGridGate($req))return;
    $payload=is_array($req->jsonBody??null)?$req->jsonBody:[];
    $tests=is_array($payload['tests']??null)?$payload['tests']:[];
    $questions=is_array($payload['questions']??null)?$payload['questions']:[];
    $links=is_array($payload['test_questions']??null)?$payload['test_questions']:[];
    $dryRun=(bool)($payload['dry_run']??false);
    $errors=[];$createdTests=0;$createdQuestions=0;$createdLinks=0;
    try{
        $subjects=SupabaseRest::select('subjects?select=id,name,slug,code&limit=1000');
        $byKey=[]; foreach($subjects as $s){foreach(['id','slug','code','name'] as $k){$v=trim((string)($s[$k]??''));if($v!=='')$byKey[mb_strtolower($v)]=(string)$s['id'];}}
        $modules=SupabaseRest::select('modules?select=id,name,slug,subject_id&limit=2000'); $moduleByKey=[]; foreach($modules as $m){foreach(['id','slug','name'] as $k){$v=trim((string)($m[$k]??''));if($v!=='')$moduleByKey[mb_strtolower((string)$m['subject_id']).'|'.mb_strtolower($v)]=(string)$m['id'];}}
        $topics=SupabaseRest::select('topics?select=id,name,slug,module_id&limit=5000'); $topicByKey=[]; foreach($topics as $t){foreach(['id','slug','name'] as $k){$v=trim((string)($t[$k]??''));if($v!=='')$topicByKey[mb_strtolower((string)$t['module_id']).'|'.mb_strtolower($v)]=(string)$t['id'];}}
        $testIds=[];
        foreach($tests as $i=>$row){
            $title=trim((string)($row['title']??''));
            $subjectKey=trim((string)($row['subject_key']??$row['subject_slug']??$row['subject']??$row['subject_id']??''));
            if($title===''){$errors[]=['sheet'=>'tests','row'=>$i+2,'error'=>'title is required'];continue;}
            $sid=$subjectKey!==''?($byKey[mb_strtolower($subjectKey)]??null):null;
            if($subjectKey!==''&&!$sid){$errors[]=['sheet'=>'tests','row'=>$i+2,'error'=>'subject not found: '.$subjectKey];continue;}
            $moduleKey=trim((string)($row['module_key']??$row['module_slug']??$row['module']??$row['module_id']??'')); $mid=$moduleKey!==''?($moduleByKey[mb_strtolower((string)$sid).'|'.mb_strtolower($moduleKey)]??null):null; if($moduleKey!==''&&!$mid){$errors[]=['sheet'=>'tests','row'=>$i+2,'error'=>'module not found: '.$moduleKey];continue;}
            $topicKey=trim((string)($row['topic_key']??$row['topic_slug']??$row['topic']??$row['topic_id']??'')); $tid=$topicKey!==''?($topicByKey[mb_strtolower((string)$mid).'|'.mb_strtolower($topicKey)]??null):null; if($topicKey!==''&&!$tid){$errors[]=['sheet'=>'tests','row'=>$i+2,'error'=>'topic not found: '.$topicKey];continue;}
            $id=trim((string)($row['id']??''));
            $sourceKey=trim((string)($row['test_key']??''));
            $data=['title'=>$title,'subject_id'=>$sid,'module_id'=>$mid,'topic_id'=>$tid,'time_limit_sec'=>($row['time_limit_sec']??null)===''?null:(int)$row['time_limit_sec'],'max_attempts'=>($row['max_attempts']??null)===''?null:(int)$row['max_attempts'],'is_published'=>filter_var($row['is_published']??true,FILTER_VALIDATE_BOOLEAN)];
            if($id!=='')$data['id']=$id;
            if(!$dryRun){$x=SupabaseRest::insert('tests',$data,true);$id=(string)($x[0]['id']??'');}
            if($id!==''){$testIds[(string)($row['id']??$title)]=$id;if($sourceKey!=='')$testIds[$sourceKey]=$id;$createdTests++;}
        }
        $questionIds=[];
        foreach($questions as $i=>$row){
            $text=trim((string)($row['text']??''));
            $subjectKey=trim((string)($row['subject_slug']??$row['subject']??$row['subject_id']??''));
            if($text===''){$errors[]=['sheet'=>'questions','row'=>$i+2,'error'=>'text is required'];continue;}
            $sid=$subjectKey!==''?($byKey[mb_strtolower($subjectKey)]??null):null;
            if($subjectKey!==''&&!$sid){$errors[]=['sheet'=>'questions','row'=>$i+2,'error'=>'subject not found: '.$subjectKey];continue;}
            $moduleKey=trim((string)($row['module_slug']??$row['module']??$row['module_id']??'')); $mid=$moduleKey!==''?($moduleByKey[mb_strtolower((string)$sid).'|'.mb_strtolower($moduleKey)]??null):null; if($moduleKey!==''&&!$mid){$errors[]=['sheet'=>'questions','row'=>$i+2,'error'=>'module not found: '.$moduleKey];continue;}
            $topicKey=trim((string)($row['topic_slug']??$row['topic']??$row['topic_id']??'')); $tid=$topicKey!==''?($topicByKey[mb_strtolower((string)$mid).'|'.mb_strtolower($topicKey)]??null):null; if($topicKey!==''&&!$tid){$errors[]=['sheet'=>'questions','row'=>$i+2,'error'=>'topic not found: '.$topicKey];continue;}
            $type=trim((string)($row['type']??'theory'));if(!in_array($type,['mcq','open','problem','theory','practical'],true)){$errors[]=['sheet'=>'questions','row'=>$i+2,'error'=>'invalid type: '.$type];continue;}
            $options=$row['options']??[];
            if(is_string($options)){try{$options=json_decode($options,true,512,JSON_THROW_ON_ERROR);}catch(\Throwable $e){$options=array_values(array_filter(array_map('trim',explode('|',$options))));}}
            if(!is_array($options))$options=[];
            $id=trim((string)($row['id']??''));
            $sourceKey=trim((string)($row['question_key']??''));
            $data=['subject_id'=>$sid,'module_id'=>$mid,'topic_id'=>$tid,'type'=>$type,'text'=>$text,'answer'=>($row['answer']??null)===''?null:(string)$row['answer'],'options'=>$options,'difficulty'=>($row['difficulty']??null)===''?null:(int)$row['difficulty'],'is_published'=>filter_var($row['is_published']??true,FILTER_VALIDATE_BOOLEAN)];
            if($id!=='')$data['id']=$id;
            if(!$dryRun){$x=SupabaseRest::insert('questions',$data,true);$id=(string)($x[0]['id']??'');}
            if($id!==''){$questionIds[(string)($row['id']??$text)]=$id;if($sourceKey!=='')$questionIds[$sourceKey]=$id;$createdQuestions++;}
        }
        foreach($links as $i=>$row){
            $testRef=trim((string)($row['test_key']??$row['test_id']??$row['test']??''));$questionRef=trim((string)($row['question_key']??$row['question_id']??$row['question']??''));
            $tid=$testIds[$testRef]??$testRef;$qid=$questionIds[$questionRef]??$questionRef;
            if($tid===''||$qid===''){$errors[]=['sheet'=>'test_questions','row'=>$i+2,'error'=>'test_id and question_id are required'];continue;}
            if(!$dryRun){SupabaseRest::insert('test_questions',['test_id'=>$tid,'question_id'=>$qid,'order_index'=>(int)($row['order_index']??$i)],true);$createdLinks++;}
        }
        Response::success(['dry_run'=>$dryRun,'created'=>['tests'=>$createdTests,'questions'=>$createdQuestions,'test_questions'=>$createdLinks],'errors'=>$errors],$req->requestId,$dryRun?200:201);
    }catch(\Throwable $e){Response::error('IMPORT_ERROR',$e->getMessage(),$req->requestId,422);}
});

// Safe content operations: archive instead of destructive delete, move across hierarchy, and restore snapshots.
$router->post('/api/v1/admin/content/archive',static function(Request $req,array $params)use($adminGridGate):void{
 if(!$adminGridGate($req))return; $p=is_array($req->jsonBody??null)?$req->jsonBody:[]; $table=(string)($p['table']??''); $id=(string)($p['id']??''); if(!in_array($table,['tests','questions'],true)||$id===''){Response::error('VALIDATION_ERROR','table and id required',$req->requestId,422);return;}
 try{$old=SupabaseRest::select($table.'?id=eq.'.rawurlencode($id).'&limit=1'); if(!$old){Response::error('NOT_FOUND','Content not found',$req->requestId,404);return;} $new=SupabaseRest::patch($table.'?id=eq.'.rawurlencode($id),['archived_at'=>gmdate('c')],true); SupabaseRest::insert('admin_change_log',['actor_user_id'=>$req->user->id,'action'=>'update','table_name'=>$table,'row_key'=>['id'=>$id],'old_data'=>$old[0],'new_data'=>$new[0]??null,'source'=>'admin_archive'],false); Response::success(['item'=>$new[0]??null],$req->requestId);
 }catch(\\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,422);}
});
$router->post('/api/v1/admin/content/move',static function(Request $req,array $params)use($adminGridGate):void{
 if(!$adminGridGate($req))return; $p=is_array($req->jsonBody??null)?$req->jsonBody:[]; $table=(string)($p['table']??''); $id=(string)($p['id']??''); $patch=[]; foreach(['subject_id','module_id','topic_id'] as $k)if(array_key_exists($k,$p))$patch[$k]=$p[$k]?:null; if(!in_array($table,['tests','questions'],true)||$id===''||!$patch){Response::error('VALIDATION_ERROR','table, id and destination required',$req->requestId,422);return;}
 try{$old=SupabaseRest::select($table.'?id=eq.'.rawurlencode($id).'&limit=1');if(!$old){Response::error('NOT_FOUND','Content not found',$req->requestId,404);return;} $new=SupabaseRest::patch($table.'?id=eq.'.rawurlencode($id),$patch,true);SupabaseRest::insert('admin_change_log',['actor_user_id'=>$req->user->id,'action'=>'move','table_name'=>$table,'row_key'=>['id'=>$id],'old_data'=>$old[0],'new_data'=>$new[0]??null,'source'=>'admin_ui'],false);Response::success(['item'=>$new[0]??null],$req->requestId);
 }catch(\\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,422);}
});
};
