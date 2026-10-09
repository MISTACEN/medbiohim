<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\SupabaseRest;

return static function(Router $router): void {
  $auth=static function(Request $req):bool{return RequireAuth::handle($req);};
  $admin=static function(Request $req):bool{if(!RequireAuth::handle($req))return false;return RequireRole::handle($req,['admin']);};

  $router->post('/api/v1/questions/{id}/report',static function(Request $req,array $p)use($auth):void{
    if(!$auth($req))return;
    $category=trim((string)$req->json('category','other'));
    $message=trim((string)$req->json('message',''));
    $allowed=['wrong_answer','wording','multiple_correct','no_correct','typo','other'];
    if(!in_array($category,$allowed,true)){Response::error('VALIDATION_ERROR','Invalid report category',$req->requestId,422);return;}
    try{
      $existing=SupabaseRest::select('question_reports?question_id=eq.'.rawurlencode((string)$p['id']).'&reporter_user_id=eq.'.rawurlencode($req->user->id).'&status=in.(new,reviewing)&category=eq.'.rawurlencode($category).'&limit=1');
      if($existing){Response::success(['item'=>$existing[0],'duplicate'=>true],$req->requestId);return;}
      $row=SupabaseRest::insert('question_reports',['question_id'=>$p['id'],'reporter_user_id'=>$req->user->id,'category'=>$category,'message'=>$message!==''?$message:null],true)[0]??null;
      Response::success(['item'=>$row],$req->requestId,201);
    }catch(\Throwable $e){\Medbiohim\Support\Logger::error('question_report_failed',['requestId'=>$req->requestId,'error'=>$e->getMessage()]);Response::error('DB_ERROR','Не удалось сохранить сообщение об ошибке вопроса',$req->requestId,503);}
  });

  $router->get('/api/v1/admin/problem-center',static function(Request $req,array $p)use($admin):void{
    if(!$admin($req))return;
    try{
      $reports=SupabaseRest::select('question_reports?select=*&order=created_at.desc&limit=500');
      $works=SupabaseRest::select('content_work_items?select=*&order=updated_at.desc&limit=500');
      $questions=SupabaseRest::select('questions?select=id,text,answer,options,subject_id,module_id,topic_id,is_published,archived_at&limit=1000');
      $qmap=[];foreach($questions as $q)$qmap[(string)$q['id']]=$q;
      $grouped=[];
      foreach($reports as $r){
        $qid=(string)$r['question_id']; $key=$qid.'|'.$r['category'];
        if(!isset($grouped[$key]))$grouped[$key]=['question_id'=>$qid,'category'=>$r['category'],'status'=>$r['status'],'reports'=>[],'report_count'=>0,'work_id'=>$r['work_id']??null];
        $grouped[$key]['reports'][]=$r;$grouped[$key]['report_count']++;
        if($r['status']==='new')$grouped[$key]['status']='new';
      }
      $problems=[];
      foreach($grouped as $g){$g['question']=$qmap[$g['question_id']]??null;$problems[]= $g;}
      Response::success(['problems'=>$problems,'reports'=>$reports,'works'=>$works],$req->requestId);
    }catch(\Throwable $e){\Medbiohim\Support\Logger::error('question_report_failed',['requestId'=>$req->requestId,'error'=>$e->getMessage()]);Response::error('DB_ERROR','Не удалось сохранить сообщение об ошибке вопроса',$req->requestId,503);}
  });

  $router->patch('/api/v1/admin/question-reports/{id}',static function(Request $req,array $p)use($admin):void{
    if(!$admin($req))return;
    $status=trim((string)$req->json('status',''));
    if(!in_array($status,['new','reviewing','fixed','rejected'],true)){Response::error('VALIDATION_ERROR','Invalid status',$req->requestId,422);return;}
    try{
      $patch=['status'=>$status];
      if($status==='fixed'||$status==='rejected'){$patch['resolved_by']=$req->user->id;$patch['resolved_at']=date('c');}
      else{$patch['resolved_by']=null;$patch['resolved_at']=null;}
      $rows=SupabaseRest::patch('question_reports?id=eq.'.rawurlencode((string)$p['id']),$patch,true);
      Response::success(['item'=>$rows[0]??null],$req->requestId);
    }catch(\Throwable $e){\Medbiohim\Support\Logger::error('question_report_failed',['requestId'=>$req->requestId,'error'=>$e->getMessage()]);Response::error('DB_ERROR','Не удалось сохранить сообщение об ошибке вопроса',$req->requestId,503);}
  });

  $router->post('/api/v1/admin/problem-center/work',static function(Request $req,array $p)use($admin):void{
    if(!$admin($req))return;
    $title=trim((string)$req->json('title',''));
    if($title===''){Response::error('VALIDATION_ERROR','title required',$req->requestId,422);return;}
    try{
      $row=SupabaseRest::insert('content_work_items',['title'=>$title,'description'=>$req->json('description',null),'priority'=>$req->json('priority','normal'),'question_id'=>$req->json('question_id',null),'report_id'=>$req->json('report_id',null),'created_by'=>$req->user->id],true)[0]??null;
      if($row && !empty($row['report_id']))SupabaseRest::patch('question_reports?id=eq.'.rawurlencode((string)$row['report_id']),['work_id'=>$row['id'],'status'=>'reviewing'],true);
      Response::success(['item'=>$row],$req->requestId,201);
    }catch(\Throwable $e){\Medbiohim\Support\Logger::error('question_report_failed',['requestId'=>$req->requestId,'error'=>$e->getMessage()]);Response::error('DB_ERROR','Не удалось сохранить сообщение об ошибке вопроса',$req->requestId,503);}
  });

  $router->patch('/api/v1/admin/problem-center/work/{id}',static function(Request $req,array $p)use($admin):void{
    if(!$admin($req))return;
    try{
      $allowed=['title','description','status','priority','assignee_user_id','question_id'];
      $patch=[];foreach($allowed as $k)if($req->jsonBody!==null&&array_key_exists($k,$req->jsonBody))$patch[$k]=$req->jsonBody[$k];
      if(($patch['status']??'')==='done')$patch['completed_at']=date('c');$patch['updated_at']=date('c');
      $rows=SupabaseRest::patch('content_work_items?id=eq.'.rawurlencode((string)$p['id']),$patch,true);
      Response::success(['item'=>$rows[0]??null],$req->requestId);
    }catch(\Throwable $e){\Medbiohim\Support\Logger::error('question_report_failed',['requestId'=>$req->requestId,'error'=>$e->getMessage()]);Response::error('DB_ERROR','Не удалось сохранить сообщение об ошибке вопроса',$req->requestId,503);}
  });
};