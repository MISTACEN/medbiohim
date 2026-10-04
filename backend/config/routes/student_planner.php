<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Database\Connection;

return static function(Router $router): void {
    $router->get('/api/v1/planner', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try {
            $db=Connection::pdo();
            $uid=(string)$req->user->id;
            $from=trim((string)($req->query['from']??''));
            $to=trim((string)($req->query['to']??''));
            $where=[];$p=['u'=>$uid];
            if($from!==''){ $where[]='h.due_date >= :from'; $p['from']=$from; }
            if($to!==''){ $where[]='h.due_date <= :to'; $p['to']=$to; }
            $sql="SELECT h.id,h.title,h.description,h.due_at,h.due_date,h.subject_id,h.group_id,h.created_by,h.created_by_role,h.created_at,
                         s.name AS subject_name,s.slug AS subject_slug,s.color_hex,
                         hp.status AS my_status,hp.completed_at,
                         hs.status AS submission_status,hs.id AS submission_id,hs.grade
                    FROM public.homeworks h
                    LEFT JOIN public.subjects s ON s.id=h.subject_id
                    LEFT JOIN public.homework_progress hp ON hp.homework_id=h.id AND hp.user_id=:u
                    LEFT JOIN public.homework_submissions hs ON hs.homework_id=h.id AND hs.user_id=:u
                   WHERE (h.group_id IS NULL OR h.group_id IN (SELECT group_id FROM public.group_memberships WHERE user_id=:u2 AND is_active=true))";
            $p['u2']=$uid;
            if($where)$sql.=' AND '.implode(' AND ',$where);
            $sql.=' ORDER BY h.due_date NULLS LAST,h.due_at NULLS LAST,h.created_at DESC';
            $q=$db->prepare($sql);$q->execute($p);$homeworks=$q->fetchAll()?:[];

            $q=$db->prepare("SELECT ar.id,ar.schedule_entry_id,ar.status,ar.note,ar.marked_at,se.date,se.start_time,se.end_time,
                                    COALESCE(se.subject_name,s.name) AS subject_name,s.slug AS subject_slug,s.color_hex,se.type,se.is_makeup
                               FROM public.attendance_records ar
                               JOIN public.schedule_entries se ON se.id=ar.schedule_entry_id
                               LEFT JOIN public.subjects s ON s.id=se.subject_id
                              WHERE ar.user_id=:u ".($from?' AND se.date>=:from':'').($to?' AND se.date<=:to':'')."
                              ORDER BY se.date,se.start_time");
            $p2=['u'=>$uid];if($from)$p2['from']=$from;if($to)$p2['to']=$to;$q->execute($p2);$attendance=$q->fetchAll()?:[];

            $recovery=[];
            foreach($attendance as $a){
                if((string)$a['status']==='present') continue;
                $key=(string)($a['subject_name']??'Без предмета');
                if(!isset($recovery[$key]))$recovery[$key]=['subject_name'=>$key,'subject_slug'=>$a['subject_slug']??null,'color_hex'=>$a['color_hex']??null,'missed'=>0,'unexcused'=>0,'excused'=>0,'sick'=>0,'entries'=>[]];
                $recovery[$key]['missed']++;
                if($a['status']==='unexcused')$recovery[$key]['unexcused']++;
                elseif($a['status']==='sick')$recovery[$key]['sick']++;
                else $recovery[$key]['excused']++;
                $recovery[$key]['entries'][]=['date'=>$a['date'],'start_time'=>$a['start_time'],'status'=>$a['status'],'is_makeup'=>(bool)$a['is_makeup']];
            }
            foreach($homeworks as $h){
                if(($h['my_status']??'')==='done'||($h['submission_status']??'')==='submitted'||($h['submission_status']??'')==='graded')continue;
                $key=(string)($h['subject_name']??'Без предмета');
                if(!isset($recovery[$key]))$recovery[$key]=['subject_name'=>$key,'subject_slug'=>$h['subject_slug']??null,'color_hex'=>$h['color_hex']??null,'missed'=>0,'unexcused'=>0,'excused'=>0,'sick'=>0,'entries'=>[]];
                $recovery[$key]['homeworks_pending']=($recovery[$key]['homeworks_pending']??0)+1;
            }
            Response::success(['homeworks'=>$homeworks,'attendance'=>$attendance,'recovery'=>array_values($recovery)],$req->requestId);
        } catch(\Throwable $e){ Response::error('PLANNER_ERROR',$e->getMessage(),$req->requestId,503); }
    });

    $router->post('/api/v1/homeworks', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try {
            $db=Connection::pdo();$uid=(string)$req->user->id;
            $title=trim((string)($req->json('title','')));
            $date=trim((string)($req->json('due_date')??''));
            $subjectId=trim((string)($req->json('subject_id')??''));
            if($title===''||$date===''||$subjectId===''){Response::error('VALIDATION_ERROR','title, due_date and subject_id are required',$req->requestId,422);return;}
            $g=$db->prepare('SELECT group_id FROM public.group_memberships WHERE user_id=:u AND is_active=true ORDER BY created_at LIMIT 1');
            $g->execute(['u'=>$uid]);$groupId=$g->fetchColumn();
            if(!$groupId){Response::error('NO_GROUP','Для добавления ДЗ нужна назначенная учебная группа',$req->requestId,422);return;}
            $s=$db->prepare('SELECT id FROM public.subjects WHERE id=:id AND is_active=true LIMIT 1');$s->execute(['id'=>$subjectId]);
            if(!$s->fetchColumn()){Response::error('SUBJECT_NOT_FOUND','Предмет не найден',$req->requestId,404);return;}
            $q=$db->prepare("INSERT INTO public.homeworks(title,description,subject_id,group_id,due_at,due_date,created_by,created_by_role)
                             VALUES(:t,:d,:s,:g,(:date::date + interval '23 hours 59 minutes'),:date,:u,'student') RETURNING *");
            $q->execute(['t'=>$title,'d'=>$req->json('description')!==null?(string)$req->json('description'):null,'s'=>$subjectId,'g'=>$groupId,'date'=>$date,'u'=>$uid]);
            Response::success(['item'=>$q->fetch()],$req->requestId,201);
        } catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}
    });

    $router->post('/api/v1/homeworks/{id}/progress', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try {
            $db=Connection::pdo();$uid=(string)$req->user->id;$done=(bool)$req->json('done',false);
            $q=$db->prepare("INSERT INTO public.homework_progress(homework_id,user_id,status,completed_at)
                             VALUES(:h,:u,:s,CASE WHEN :done=true THEN now() ELSE NULL END)
                             ON CONFLICT(homework_id,user_id) DO UPDATE SET status=EXCLUDED.status,completed_at=EXCLUDED.completed_at,updated_at=now()
                             RETURNING *");
            $q->execute(['h'=>(string)$params['id'],'u'=>$uid,'s'=>$done?'done':'pending','done'=>$done?'true':'false']);
            Response::success(['progress'=>$q->fetch()],$req->requestId);
        } catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}
    });

    $router->post('/api/v1/attendance/{entryId}', static function(Request $req,array $params): void {
        if(!RequireAuth::handle($req)) return;
        try {
            $db=Connection::pdo();$uid=(string)$req->user->id;$status=trim((string)($req->json('status')??''));
            if(!in_array($status,['present','excused','sick','unexcused'],true)){Response::error('VALIDATION_ERROR','Invalid attendance status',$req->requestId,422);return;}
            $check=$db->prepare("SELECT 1 FROM public.schedule_entries se
                                  JOIN public.schedules sch ON sch.id=se.schedule_id AND sch.is_active=true
                                  WHERE se.id=:e AND sch.group_id IN (SELECT group_id FROM public.group_memberships WHERE user_id=:u AND is_active=true) LIMIT 1");
            $check->execute(['e'=>(string)$params['entryId'],'u'=>$uid]);
            if(!$check->fetchColumn()){Response::error('FORBIDDEN','Пара не относится к вашей группе',$req->requestId,403);return;}
            $q=$db->prepare("INSERT INTO public.attendance_records(schedule_entry_id,user_id,status,note)
                             VALUES(:e,:u,:s,:n)
                             ON CONFLICT(schedule_entry_id,user_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,updated_at=now()
                             RETURNING *");
            $q->execute(['e'=>(string)$params['entryId'],'u'=>$uid,'s'=>$status,'n'=>$req->json('note')!==null?(string)$req->json('note'):null]);
            Response::success(['attendance'=>$q->fetch()],$req->requestId);
        } catch(\Throwable $e){Response::error('DB_ERROR',$e->getMessage(),$req->requestId,503);}
    });
};
