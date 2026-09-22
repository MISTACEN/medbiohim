<?php
declare(strict_types=1);

/**
 * One-time legacy JSON -> Supabase importer.
 *
 * Run on the backend host where backend/data/*.json still exists:
 *   php backend/scripts/migrate_json_to_supabase.php
 *
 * It is intentionally additive/idempotent where possible. Do not delete
 * backend/data until the verification report is clean.
 */

require dirname(__DIR__) . '/vendor/autoload.php';

use Medbiohim\Services\SupabaseRest;

$dir = dirname(__DIR__) . '/data';
if (!is_dir($dir)) {
    fwrite(STDERR, "backend/data not found: {$dir}\n");
    exit(2);
}

function readJson(string $file, mixed $default=[]): mixed {
    if (!is_file($file)) return $default;
    $raw=file_get_contents($file);
    if ($raw===false || trim($raw)==='') return $default;
    $v=json_decode($raw,true);
    return $v ?? $default;
}
function items(string $file): array {
    $d=readJson($file,[]);
    if (isset($d['items']) && is_array($d['items'])) return $d['items'];
    return is_array($d) ? $d : [];
}
function iso(?string $v): ?string { return $v ? date(DATE_ATOM,strtotime($v)) : null; }

$report=[];

/* Site + announcements -> site_content */
$site=readJson($dir.'/site.json',[]);
$site=is_array($site)&&isset($site['site'])&&is_array($site['site'])?$site['site']:$site;
if (is_array($site) && $site) {
    SupabaseRest::patch('site_content?key=eq.site',['payload'=>$site,'updated_at'=>gmdate('c')],false);
    if (!SupabaseRest::select('site_content?key=eq.site&select=key')) {
        SupabaseRest::insert('site_content',['key'=>'site','payload'=>$site,'updated_at'=>gmdate('c')],false);
    }
    $report['site']=1;
}
$ann=items($dir.'/announcements.json');
if ($ann) {
    $payload=['items'=>array_values($ann)];
    if (SupabaseRest::select('site_content?key=eq.announcements&select=key')) {
        SupabaseRest::patch('site_content?key=eq.announcements',['payload'=>$payload,'updated_at'=>gmdate('c')],false);
    } else SupabaseRest::insert('site_content',['key'=>'announcements','payload'=>$payload,'updated_at'=>gmdate('c')],false);
    $report['announcements']=count($ann);
}

/* Subjects/catalog -> normalized subjects. Existing rows are matched by slug/code/name. */
$catalog=items($dir.'/subjects_catalog.json');
$n=0;
foreach($catalog as $s){
    if(!is_array($s)||trim((string)($s['name']??''))==='')continue;
    $name=trim((string)$s['name']); $code=$s['code']??null; $slug=$s['slug']??null;
    $where=$code?'code=eq.'.rawurlencode((string)$code):($slug?'slug=eq.'.rawurlencode((string)$slug):'name=eq.'.rawurlencode($name));
    $found=SupabaseRest::select('subjects?'.$where.'&select=id');
    $row=['name'=>$name,'code'=>$code,'slug'=>$slug,'short_name'=>$s['short_name']??null,'description'=>$s['description']??null,'course_number'=>$s['course_number']??null,'semester'=>$s['semester']??null,'control_type'=>$s['control_type']??null,'lecture_hours'=>$s['lecture_hours']??null,'practice_hours'=>$s['practice_hours']??null,'is_active'=>$s['is_active']??true];
    if($found) SupabaseRest::patch('subjects?id=eq.'.rawurlencode((string)$found[0]['id']),$row,false);
    else SupabaseRest::insert('subjects',$row,false);
    $n++;
}
$report['subjects']=$n;

/* Subject plans/curriculum are document-shaped legacy content: keep them in Supabase JSONB, not filesystem JSON. */
$plans=readJson($dir.'/subject_plans.json',[]);
foreach((array)($plans['plans']??[]) as $slug=>$plan){
    if(!is_array($plan))continue;
    $key='subject_plan:'.(string)$slug;
    if(SupabaseRest::select('site_content?key=eq.'.rawurlencode($key).'&select=key')) SupabaseRest::patch('site_content?key=eq.'.rawurlencode($key),['payload'=>$plan,'updated_at'=>gmdate('c')],false);
    else SupabaseRest::insert('site_content',['key'=>$key,'payload'=>$plan,'updated_at'=>gmdate('c')],false);
}
$report['subject_plans']=count((array)($plans['plans']??[]));

/* Legacy exam/question bank -> exam_questions. */
$questions=items($dir.'/questions_bank.json');
$n=0;
foreach($questions as $q){
    if(!is_array($q))continue;
    $row=['subject_id'=>$q['subject_id']??null,'subject_name'=>(string)($q['subject_name']??$q['subject']??''),'subject_slug'=>$q['subject_slug']??null,'topic'=>$q['topic']??null,'text'=>(string)($q['text']??$q['question']??$q['q']??''),'answer'=>$q['answer']??null,'kind'=>'ticket','type'=>$q['type']??'open','for_exam'=>true,'for_ticket'=>true,'source'=>$q['source']??'legacy-json','is_published'=>$q['is_published']??true];
    $id=(string)($q['id']??'');
    if($id && preg_match('/^[0-9a-f-]{36}$/i',$id) && SupabaseRest::select('exam_questions?id=eq.'.rawurlencode($id).'&select=id')) SupabaseRest::patch('exam_questions?id=eq.'.rawurlencode($id),$row,false);
    else SupabaseRest::insert('exam_questions',$row,false);
    $n++;
}
$report['exam_questions']=$n;

/* Schedule JSON -> schedules/schedule_entries. Prefer explicit group_code metadata. */
$sched=items($dir.'/schedule.json');
if($sched){
    $meta=readJson($dir.'/schedule.json',[]);
    $groupCode=(string)($meta['meta']['group_code']??'');
    $groups=$groupCode?SupabaseRest::select('groups?code=eq.'.rawurlencode($groupCode).'&select=id'):SupabaseRest::select('groups?is_active=eq.true&select=id&limit=1');
    if($groups){
        $gid=(string)$groups[0]['id'];
        $x=SupabaseRest::insert('schedules',['group_id'=>$gid,'semester'=>null,'version'=>1,'is_active'=>true,'academic_year'=>null],true);
        $sid=$x[0]['id']??null;
        $n=0;
        foreach($sched as $e){
            if(!$sid||!is_array($e)||empty($e['date'])||empty($e['start_time']))continue;
            SupabaseRest::insert('schedule_entries',['schedule_id'=>$sid,'subject_id'=>$e['subject_id']??null,'date'=>$e['date'],'start_time'=>$e['start_time'],'end_time'=>$e['end_time']??$e['start_time'],'type'=>$e['type']??'other','room'=>$e['room']??null,'building'=>$e['building']??null,'notes'=>$e['notes']??null,'is_cancelled'=>(bool)($e['is_cancelled']??false),'subject_name'=>$e['subject_name']??$e['subject']??null,'sort_order'=>(int)($e['sort_order']??0)],false);
            $n++;
        }
        $report['schedule_entries']=$n;
    } else $report['schedule_entries']='skipped:no_group';
}

/* Community -> normalized table */
$posts=items($dir.'/community.json');$n=0;
foreach($posts as $p){if(!is_array($p)||empty($p['author_id'])||empty($p['body'])&&empty($p['text']))continue;SupabaseRest::insert('community_posts',['author_id'=>$p['author_id'],'group_id'=>$p['group_id']??null,'tag'=>$p['tag']??null,'text'=>(string)($p['text']??$p['body']),'title'=>$p['title']??null,'body'=>$p['body']??null],false);$n++;}
$report['community_posts']=$n;

/* Personal notes/favorites/sessions */
foreach(['notes','favorites'] as $kind){
    $rows=items($dir.'/'.$kind.'.json');$n=0;
    foreach($rows as $r){if(!is_array($r)||empty($r['user_id']))continue;
        if($kind==='notes' && !empty($r['target_id']))SupabaseRest::insert('notes',['user_id'=>$r['user_id'],'target_type'=>$r['target_type']??'question','target_id'=>$r['target_id'],'text'=>(string)($r['text']??$r['body']??'')],false);
        if($kind==='favorites' && !empty($r['target_id']))SupabaseRest::insert('favorites',['user_id'=>$r['user_id'],'target_type'=>$r['target_type']??'question','target_id'=>$r['target_id']],false);
        $n++;
    }
    $report[$kind]=$n;
}
$sessions=items($dir.'/sessions.json');$n=0;
foreach($sessions as $s){if(!is_array($s)||empty($s['user_id']))continue;SupabaseRest::insert('learning_sessions',['user_id'=>$s['user_id'],'type'=>$s['type']??'practice','ref_id'=>$s['ref_id']??null,'title'=>$s['title']??'Сессия','status'=>$s['status']??'in_progress','current_index'=>(int)($s['current_index']??0),'answers'=>$s['answers']??new stdClass(),'payload'=>$s['payload']??new stdClass(),'score'=>$s['score']??null,'finished_at'=>iso($s['finished_at']??null)],false);$n++;}
$report['sessions']=$n;

echo json_encode(['ok'=>true,'report'=>$report,'note'=>'JSON files were not deleted. Verify counts before archival.'],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
