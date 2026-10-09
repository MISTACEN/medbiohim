<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Services\ExcelScheduleImporter;
use Medbiohim\Services\SupabaseRest;
return static function(Router $r):void{
 $gate=static fn(Request $q):bool=>RequireAuth::handle($q)&&RequireRole::handle($q,['admin']);
 $r->post('/api/v1/admin/users/{id}/course',static function(Request $q,array $p)use($gate):void{if(!$gate($q))return;$v=$q->json('course_number',null);$c=$v===null?null:(int)$v;if($c!==null&&($c<1||$c>6)){Response::error('VALIDATION_ERROR','course_number must be 1..6 or null',$q->requestId,422);return;}try{Response::success(['user'=>SupabaseRest::setUserCourse($p['id'],$c)],$q->requestId);}catch(\Throwable $e){\Medbiohim\Support\Logger::error('admin_user_course_update_failed',['requestId'=>$q->requestId,'error'=>$e->getMessage()]);Response::error('DB_ERROR','Не удалось обновить курс пользователя',$q->requestId,503);}});
 $r->post('/api/v1/admin/schedule/import',static function(Request $q,array $p)use($gate):void{if(!$gate($q))return;$f=$_FILES['file']??null;if(!is_array($f)||($f['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK){Response::error('VALIDATION_ERROR','Upload .xlsx in multipart field "file".',$q->requestId,422);return;}try{$rows=ExcelScheduleImporter::parse((string)$f['tmp_name']);$gid=trim((string)($_POST['group_id']??''));$sem=$_POST['semester']??null;if($gid==='')throw new \InvalidArgumentException('group_id is required');$subjects=SupabaseRest::listSubjects();$map=[];foreach($subjects as $x)$map[mb_strtolower(trim((string)$x['name']),'UTF-8')]=$x['id'];$entries=[];foreach($rows as $x){$key=mb_strtolower($x['subject'],'UTF-8');$sid=$map[$key]??null;if(!$sid&&$x['subject']!==''){$sid=SupabaseRest::createSubject(['name'=>$x['subject'],'semester'=>$sem===null||$sem===''?null:(int)$sem])['id']??null;$map[$key]=$sid;}$entries[]=array_merge($x,['subject_id'=>$sid]);}$out=SupabaseRest::replaceSchedule(['group_id'=>$gid,'semester'=>$sem===null||$sem===''?null:(int)$sem,'academic_year_id'=>$_POST['academic_year_id']??null,'entries'=>$entries]);Response::success($out,$q->requestId,201);}catch(\InvalidArgumentException $e){Response::error('VALIDATION_ERROR',$e->getMessage(),$q->requestId,422);}catch(\Throwable $e){\Medbiohim\Support\Logger::error('admin_schedule_import_failed',['requestId'=>$q->requestId,'error'=>$e->getMessage()]);Response::error('IMPORT_FAILED','Не удалось импортировать расписание',$q->requestId,503);}});
};
