<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

/** HTTPS fallback to Supabase PostgREST when outbound PostgreSQL is unavailable. */
final class SupabaseRest
{
    private static function request(string $method, string $path, ?array $body = null, array $extraHeaders = []): array
    {
        $base = rtrim((string) Env::get('SUPABASE_URL', ''), '/');
        $key = (string) Env::get('SUPABASE_SERVICE_KEY', '');
        if ($base === '' || $key === '') throw new \RuntimeException('Supabase REST fallback is not configured');
        $res = HttpClient::request($method, $base . '/rest/v1/' . ltrim($path, '/'), $body, array_merge([
            'apikey: ' . $key, 'Authorization: Bearer ' . $key,
        ], $extraHeaders), 15);
        if ($res['status'] < 200 || $res['status'] >= 300) {
            $detail = is_array($res['json']) ? json_encode($res['json'], JSON_UNESCAPED_UNICODE) : trim($res['body']);
            throw new \RuntimeException('Supabase REST request failed (' . $res['status'] . '): ' . substr((string)$detail, 0, 500));
        }
        return is_array($res['json']) ? $res['json'] : [];
    }

    public static function listGroups(): array
    {
        return self::request('GET', 'groups?is_active=eq.true&select=id,code,name,course_number,admission_year,is_active,created_at&order=course_number.asc.nullslast,name.asc');
    }

    public static function createGroup(array $data): array
    {
        $name=trim((string)($data['name']??'')); if($name==='') throw new \InvalidArgumentException('Group name is required');
        $base=trim((string)($data['code']??'')); if($base==='')$base=self::makeCode($name);
        for($i=0;$i<8;$i++){ $code=$i===0?$base:$base.'-'.($i+1); try{$rows=self::request('POST','groups',['code'=>$code,'name'=>$name,'course_number'=>$data['course_number']??null,'admission_year'=>$data['admission_year']??null],['Prefer: return=representation']); if(!isset($rows[0])||!is_array($rows[0]))throw new \RuntimeException('Supabase REST create group returned no row'); return $rows[0];}catch(\Throwable $e){if($i>=7||!str_contains($e->getMessage(),'(409)'))throw $e;}}
        throw new \RuntimeException('Could not create group');
    }

    public static function listSubjects(?int $course=null, ?int $semester=null): array
    {
        $path='subjects?is_active=eq.true&select='.rawurlencode('id,name,course_number,semester,control_type,lecture_hours,practice_hours,is_active');
        if($course!==null)$path.='&course_number=eq.'.rawurlencode((string)$course); if($semester!==null)$path.='&semester=eq.'.rawurlencode((string)$semester);
        return self::request('GET',$path.'&order=course_number.asc.nullslast,semester.asc.nullslast,name.asc');
    }

    public static function createSubject(array $data): array
    {
        $name=trim((string)($data['name']??'')); if($name==='')throw new \InvalidArgumentException('Subject name is required');
        $rows=self::request('POST','subjects',['name'=>$name,'course_number'=>$data['course_number']??null,'semester'=>$data['semester']??null,'control_type'=>$data['control_type']??null,'lecture_hours'=>$data['lecture_hours']??null,'practice_hours'=>$data['practice_hours']??null],['Prefer: return=representation']);
        if(!isset($rows[0])||!is_array($rows[0]))throw new \RuntimeException('Supabase REST create subject returned no row'); return $rows[0];
    }

    public static function listSchedule(?string $groupId=null, ?int $semester=null): array
    {
        $select='id,group_id,academic_year_id,semester,version,created_at,schedule_entries(id,subject_id,date,start_time,end_time,type,room,building,notes,is_cancelled)';
        $path='schedules?select='.rawurlencode($select); if($groupId!==null&&$groupId!=='')$path.='&group_id=eq.'.rawurlencode($groupId); if($semester!==null)$path.='&semester=eq.'.rawurlencode((string)$semester);
        return self::request('GET',$path.'&order=group_id.asc,semester.asc.nullslast,version.desc,created_at.desc');
    }

    public static function listScheduleForUser(string $userId, ?string $from=null, ?string $to=null): array
    {
        $members=self::request('GET','group_memberships?user_id=eq.'.rawurlencode($userId).'&is_active=eq.true&select=group_id'); $ids=[]; foreach($members as $m)if(isset($m['group_id']))$ids[]=(string)$m['group_id']; if(!$ids)return [];
        $quoted=implode(',',array_map(static fn($id)=>'"'.str_replace('"','\\"',$id).'"',array_values(array_unique($ids))));
        $select='id,group_id,semester,version,created_at,schedule_entries(id,subject_id,date,start_time,end_time,type,room,building,notes,is_cancelled)';
        $rows=self::request('GET','schedules?group_id=in.('.rawurlencode($quoted).')&select='.rawurlencode($select).'&order=group_id.asc,semester.asc.nullslast,version.desc,created_at.desc');
        $latest=[]; foreach($rows as $row){$key=(string)$row['group_id'].':'.(string)($row['semester']??0); if(!isset($latest[$key]))$latest[$key]=$row;}
        $out=[]; foreach($latest as $schedule)foreach(($schedule['schedule_entries']??[]) as $entry){$date=(string)($entry['date']??''); if($from!==null&&$from!==''&&$date<$from)continue;if($to!==null&&$to!==''&&$date>$to)continue;$entry['schedule_id']=$schedule['id']??null;$entry['group_id']=$schedule['group_id']??null;$entry['semester']=$schedule['semester']??null;$entry['version']=$schedule['version']??null;$out[]=$entry;}
        usort($out,static fn($a,$b)=>strcmp((string)($a['date']??''),(string)($b['date']??''))?:strcmp((string)($a['start_time']??''),(string)($b['start_time']??''))); return $out;
    }

    public static function replaceSchedule(array $payload): array
    {
        $groupId=trim((string)($payload['group_id']??'')); if($groupId==='')throw new \InvalidArgumentException('group_id is required'); $semester=($payload['semester']??'')===''?null:(int)$payload['semester'];
        $existing=self::listSchedule($groupId,$semester);$version=1;foreach($existing as $r)$version=max($version,((int)($r['version']??0))+1);
        $rows=self::request('POST','schedules',['group_id'=>$groupId,'academic_year_id'=>$payload['academic_year_id']??null,'semester'=>$semester,'version'=>$version],['Prefer: return=representation']);if(!isset($rows[0]['id']))throw new \RuntimeException('Could not create schedule');$sid=(string)$rows[0]['id'];$saved=0;
        foreach((is_array($payload['entries']??null)?$payload['entries']:[]) as $entry){if(!is_array($entry))continue;$date=trim((string)($entry['date']??''));$start=trim((string)($entry['start_time']??$entry['startTime']??''));$end=trim((string)($entry['end_time']??$entry['endTime']??''));if($date===''||$start===''||$end==='')throw new \InvalidArgumentException('Each schedule entry requires date, start_time and end_time');$type=strtolower(trim((string)($entry['type']??'other')));if(!in_array($type,['lecture','practice','laboratory','seminar','exam','credit','consultation','other'],true))$type='other';self::request('POST','schedule_entries',['schedule_id'=>$sid,'subject_id'=>($entry['subject_id']??null)?:null,'date'=>$date,'start_time'=>$start,'end_time'=>$end,'type'=>$type,'room'=>($entry['room']??null)!==''?($entry['room']??null):null,'building'=>($entry['building']??null)!==''?($entry['building']??null):null,'notes'=>($entry['notes']??null)!==''?($entry['notes']??null):null,'is_cancelled'=>(bool)($entry['is_cancelled']??false)],['Prefer: return=minimal']);$saved++;}
        return ['schedule_id'=>$sid,'group_id'=>$groupId,'semester'=>$semester,'version'=>$version,'entries_saved'=>$saved];
    }

    public static function listHomeworksForUser(string $userId): array
    {
        $members=self::request('GET','group_memberships?user_id=eq.'.rawurlencode($userId).'&is_active=eq.true&select=group_id');$ids=[];foreach($members as $m)if(isset($m['group_id']))$ids[]=(string)$m['group_id'];$filters=['group_id=is.null'];if($ids){$quoted=implode(',',array_map(static fn($id)=>'"'.str_replace('"','\\"',$id).'"',$ids));$filters[]='group_id=in.('.$quoted.')';}
        $select='id,title,description,due_at,subject_id,group_id,created_at,subjects(name),homework_submissions!left(id,status,grade,submitted_at,user_id)';
        $rows=self::request('GET','homeworks?or=('.implode(',',array_map('rawurlencode',$filters)).')&select='.rawurlencode($select).'&homework_submissions.user_id=eq.'.rawurlencode($userId).'&order=due_at.asc.nullslast,created_at.desc');
        foreach($rows as &$r){$sub=$r['homework_submissions']??[];if(is_array($sub)&&isset($sub[0])){$r['submission_id']=$sub[0]['id']??null;$r['my_status']=$sub[0]['status']??null;$r['grade']=$sub[0]['grade']??null;$r['submitted_at']=$sub[0]['submitted_at']??null;}unset($r['homework_submissions']);$r['subject_name']=$r['subjects']['name']??null;unset($r['subjects']);}return $rows;
    }

    public static function listHomeworksForReview(): array
    {
        $select='id,title,description,due_at,subject_id,group_id,created_at,subjects(name),groups(name),homework_submissions(id,user_id,status,text_answer,file_id,grade,teacher_comment,submitted_at,users(full_name,email))';$rows=self::request('GET','homeworks?select='.rawurlencode($select).'&order=due_at.asc.nullslast,created_at.desc');$out=[];
        foreach($rows as $h){$subs=$h['homework_submissions']??[null];if(!$subs)$subs=[null];foreach($subs as $sub){$r=$h;unset($r['homework_submissions']);$r['subject_name']=$h['subjects']['name']??null;$r['group_name']=$h['groups']['name']??null;unset($r['subjects'],$r['groups']);if(is_array($sub)){$r['submission_id']=$sub['id']??null;$r['student_id']=$sub['user_id']??null;$r['submission_status']=$sub['status']??null;$r['text_answer']=$sub['text_answer']??null;$r['file_id']=$sub['file_id']??null;$r['grade']=$sub['grade']??null;$r['teacher_comment']=$sub['teacher_comment']??null;$r['submitted_at']=$sub['submitted_at']??null;$r['student_name']=$sub['users']['full_name']??null;$r['student_email']=$sub['users']['email']??null;}$out[]=$r;}}return $out;
    }

    public static function createHomework(array $data): array
    {
        $rows=self::request('POST','homeworks',['title'=>$data['title'],'description'=>$data['description']??null,'subject_id'=>$data['subject_id']??null,'group_id'=>$data['group_id']??null,'due_at'=>$data['due_at']??null,'created_by'=>$data['created_by']??null],['Prefer: return=representation']);if(!isset($rows[0]))throw new \RuntimeException('Could not create homework');return $rows[0];
    }

    public static function listUsers(int $limit=100): array
    {
        $rows=self::request('GET','users?select=id,email,full_name,created_at&order=created_at.desc.nullslast&limit='.(int)$limit);foreach($rows as &$u){$roles=self::request('GET','user_roles?user_id=eq.'.rawurlencode((string)$u['id']).'&select=roles(code)');$u['roles']=[];foreach($roles as $r)if(isset($r['roles']['code']))$u['roles'][]=$r['roles']['code'];}return $rows;
    }

    private static function makeCode(string $name): string
    {
        $map=['а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'e','ж'=>'zh','з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'c','ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya'];$value=strtr(mb_strtolower($name,'UTF-8'),$map);$value=preg_replace('/[^a-z0-9]+/u','-',$value)??'';$value=trim($value,'-');return substr($value!==''?$value:'group',0,80);
    }
}
// synced 2026-09-15
