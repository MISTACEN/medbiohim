<?php
declare(strict_types=1);

namespace Medbiohim\Support;

use Medbiohim\Services\SupabaseRest;

/**
 * Persistent content facade.
 *
 * IMPORTANT: this class no longer reads/writes backend/data/*.json.
 * Supabase is the single source of truth. JSONB is used only where the
 * existing product contract is document-shaped (site content and subject plans).
 */
final class ContentStore
{
    private function content(string $key, array $default=[]): array
    {
        $rows = SupabaseRest::select('site_content?key=eq.'.rawurlencode($key).'&select=payload');
        return isset($rows[0]['payload']) && is_array($rows[0]['payload']) ? $rows[0]['payload'] : $default;
    }

    private function saveContent(string $key, array $payload): array
    {
        $existing = SupabaseRest::select('site_content?key=eq.'.rawurlencode($key).'&select=key');
        if ($existing) {
            SupabaseRest::patch('site_content?key=eq.'.rawurlencode($key), ['payload'=>$payload,'updated_at'=>gmdate('c')], false);
        } else {
            SupabaseRest::insert('site_content', ['key'=>$key,'payload'=>$payload,'updated_at'=>gmdate('c')], false);
        }
        return $payload;
    }

    public function getSite(): array
    {
        return array_merge(['title'=>'Медбиохим','subtitle'=>'Учебная платформа','description'=>'','announcement_banner'=>'','contacts'=>[]], $this->content('site'));
    }

    public function updateSite(array $p): array
    {
        $site=array_merge($this->getSite(),$p);
        $this->saveContent('site',$site);
        return $site;
    }

    public function listAnnouncements(): array
    {
        $d=$this->content('announcements',['items'=>[]]);
        return isset($d['items'])&&is_array($d['items'])?$d['items']:[];
    }

    public function createAnnouncement(array $d): array
    {
        $items=$this->listAnnouncements();
        $row=array_merge(['id'=>'ann-'.bin2hex(random_bytes(8)),'created_at'=>gmdate('c'),'pinned'=>false],$d);
        $items[]=$row; $this->saveContent('announcements',['items'=>$items]); return $row;
    }

    public function updateAnnouncement(string $id,array $p): ?array
    {
        $items=$this->listAnnouncements();
        foreach($items as $i=>$row) if((string)($row['id']??'')===$id){$items[$i]=array_merge($row,$p,['updated_at'=>gmdate('c')]);$this->saveContent('announcements',['items'=>$items]);return $items[$i];}
        return null;
    }

    public function deleteAnnouncement(string $id): bool
    {
        $items=$this->listAnnouncements(); $next=array_values(array_filter($items,fn($r)=>(string)($r['id']??'')!==$id));
        if(count($items)==count($next))return false; $this->saveContent('announcements',['items'=>$next]); return true;
    }

    public function listCurriculum(): array
    {
        return SupabaseRest::listSubjects();
    }

    public function saveCurriculum(array $items): array
    {
        foreach($items as $item){
            if(!is_array($item)||empty($item['name']))continue;
            SupabaseRest::createSubject($item);
        }
        return $this->listCurriculum();
    }

    public function curriculumPlan(): array { return $this->content('curriculum',['items'=>$this->listCurriculum()]); }

    public function listTestsLocal(): array
    {
        $tests=SupabaseRest::select('tests?is_published=eq.true&select=id,subject_id,module_id,topic_id,title,time_limit_sec,max_attempts,is_published,created_at&order=created_at.desc');
        foreach($tests as &$t){$q=SupabaseRest::select('test_questions?test_id=eq.'.rawurlencode((string)$t['id']).'&select=question_id,order_index&order=order_index.asc');$t['questions']=$q;$t['questions_count']=count($q);$t['source']='db';}unset($t);
        return $tests;
    }

    public function listSchedule(): array
    {
        $rows=SupabaseRest::select('schedule_entries?select=id,schedule_id,subject_id,date,start_time,end_time,type,room,building,notes,is_cancelled,subject_name,sort_order&order=date.asc,start_time.asc');
        return $rows;
    }

    public function scheduleMeta(): array { return $this->content('schedule_meta',[]); }

    public function readRawSubjectsCatalog(): array { return ['items'=>SupabaseRest::listSubjects()]; }
    public function listSubjectsCatalog(): array { return SupabaseRest::listSubjects(); }

    public function getSubjectPlan(string $slug): ?array
    {
        $d=$this->content('subject_plan:'.$slug,[]);
        return $d?:null;
    }

    public function listSubjectPlans(): array
    {
        $rows=SupabaseRest::select('site_content?key=like.subject_plan:*&select=key,payload');
        $out=[]; foreach($rows as $r) if(isset($r['payload'])&&is_array($r['payload']))$out[(string)$r['key']]= $r['payload']; return $out;
    }

    public function saveSchedule(array $items,?array $meta=null): array
    {
        throw new \RuntimeException('Legacy JSON schedule write disabled; use /api/v1/admin/schedule');
    }

    public function listCommunityPosts(): array
    {
        return SupabaseRest::select('community_posts?is_deleted=eq.false&select=id,author_id,group_id,tag,text,title,body,created_at,updated_at&order=created_at.desc');
    }

    public function createCommunityPost(array $d): array
    {
        $row=SupabaseRest::insert('community_posts',['author_id'=>$d['author_id'],'group_id'=>$d['group_id']??null,'tag'=>$d['tag']??null,'text'=>$d['text']??($d['body']??''),'title'=>$d['title']??null,'body'=>$d['body']??null],true);
        return $row[0]??[];
    }

    public function updateCommunityPost(string $id,array $p): ?array
    {
        $row=SupabaseRest::patch('community_posts?id=eq.'.rawurlencode($id),$p,true); return $row[0]??null;
    }

    public function deleteCommunityPost(string $id): bool
    {
        SupabaseRest::patch('community_posts?id=eq.'.rawurlencode($id),['is_deleted'=>true],false); return true;
    }

    public function listQuestionsBank(): array
    {
        return SupabaseRest::select('exam_questions?is_published=eq.true&select=id,subject_id,subject_name,subject_slug,topic,text,answer,kind,type,for_exam,for_ticket,source,is_published,created_at,updated_at&order=created_at.asc');
    }

    public function saveQuestionsBank(array $items): array { return $this->listQuestionsBank(); }

    public function upsertQuestion(array $q): array
    {
        $id=(string)($q['id']??'');
        $row=['subject_id'=>$q['subject_id']??null,'subject_name'=>(string)($q['subject_name']??$q['subject']??''),'subject_slug'=>$q['subject_slug']??null,'topic'=>$q['topic']??null,'text'=>(string)($q['text']??$q['question']??''),'answer'=>$q['answer']??null,'kind'=>'ticket','type'=>$q['type']??'open','for_exam'=>(bool)($q['for_exam']??true),'for_ticket'=>(bool)($q['for_ticket']??true),'source'=>$q['source']??'import','is_published'=>(bool)($q['is_published']??true)];
        if($id!==''){$x=SupabaseRest::patch('exam_questions?id=eq.'.rawurlencode($id),$row,true);return $x[0]??array_merge(['id'=>$id],$row);}
        $x=SupabaseRest::insert('exam_questions',$row,true);return $x[0]??$row;
    }

    public function deleteQuestion(string $id): bool { SupabaseRest::patch('exam_questions?id=eq.'.rawurlencode($id),['is_published'=>false],false);return true; }

    public function listSessions(string $userId): array { return SupabaseRest::select('learning_sessions?user_id=eq.'.rawurlencode($userId).'&select=*&order=updated_at.desc'); }
    public function getSession(string $userId,string $id): ?array { $x=SupabaseRest::select('learning_sessions?id=eq.'.rawurlencode($id).'&user_id=eq.'.rawurlencode($userId).'&select=*');return $x[0]??null; }
    public function saveSession(array $s): array
    {
        $id=(string)($s['id']??'');
        $row=['user_id'=>$s['user_id'],'type'=>$s['type']??'practice','ref_id'=>$s['ref_id']??null,'title'=>$s['title']??'Сессия','status'=>$s['status']??'in_progress','current_index'=>(int)($s['current_index']??0),'answers'=>$s['answers']??new \stdClass(),'payload'=>$s['payload']??new \stdClass(),'score'=>$s['score']??null,'finished_at'=>$s['finished_at']??null,'updated_at'=>gmdate('c')];
        if($id!==''){$x=SupabaseRest::patch('learning_sessions?id=eq.'.rawurlencode($id).'&user_id=eq.'.rawurlencode($s['user_id']),$row,true);return $x[0]??array_merge(['id'=>$id],$row);}
        $x=SupabaseRest::insert('learning_sessions',$row,true);return $x[0]??$row;
    }

    public function listNotes(string $userId): array { return SupabaseRest::select('notes?user_id=eq.'.rawurlencode($userId).'&select=id,user_id,target_type,target_id,text,created_at,updated_at&order=updated_at.desc'); }
    public function upsertNote(array $n): array
    {
        $row=['user_id'=>$n['user_id'],'target_type'=>$n['target_type']??'question','target_id'=>$n['target_id'],'text'=>(string)($n['text']??$n['body']??'')];
        $x=SupabaseRest::select('notes?user_id=eq.'.rawurlencode($n['user_id']).'&target_type=eq.'.rawurlencode($row['target_type']).'&target_id=eq.'.rawurlencode($row['target_id']).'&select=id');
        if($x){$z=SupabaseRest::patch('notes?id=eq.'.rawurlencode($x[0]['id']),array_merge($row,['updated_at'=>gmdate('c')]),true);return $z[0]??$row;}
        $z=SupabaseRest::insert('notes',$row,true);return $z[0]??$row;
    }

    public function listFavorites(string $userId): array { return SupabaseRest::select('favorites?user_id=eq.'.rawurlencode($userId).'&select=user_id,target_type,target_id,created_at&order=created_at.desc'); }
    public function toggleFavorite(string $userId,string $targetType,string $targetId): array
    {
        $p='favorites?user_id=eq.'.rawurlencode($userId).'&target_type=eq.'.rawurlencode($targetType).'&target_id=eq.'.rawurlencode($targetId);
        if(SupabaseRest::select($p)){SupabaseRest::deleteWhere($p);return ['favorited'=>false];}
        SupabaseRest::insert('favorites',['user_id'=>$userId,'target_type'=>$targetType,'target_id'=>$targetId],false);return ['favorited'=>true];
    }

    public function findLessonPlan(?string $date,?string $subject,?string $slug=null): array
    {
        $plan=$slug?$this->getSubjectPlan($slug):null;
        if($plan===null&&$subject){$needle=mb_strtolower(trim($subject));foreach($this->listSubjectPlans() as $p){$v=$p['subject']??'';if(mb_strtolower((string)$v)===$needle){$plan=$p;break;}}}
        if($plan===null)return ['lesson'=>null,'weeks'=>[],'plan_meta'=>null];
        $weeks=is_array($plan['weeks']??null)?$plan['weeks']:[];$lesson=null;
        if($date)foreach($weeks as $w)if((string)($w['date']??'')===$date){$lesson=$w;break;}
        return ['lesson'=>$lesson,'weeks'=>$weeks,'plan_meta'=>['subject'=>$plan['subject']??null,'subject_slug'=>$plan['subject_slug']??null,'control'=>$plan['control']??null,'semester'=>$plan['semester']??null]];
    }

    public function saveSubjectPlans(array $plans): array
    {
        foreach($plans as $p){if(!is_array($p)||empty($p['subject_slug']))continue;$this->saveContent('subject_plan:'.(string)$p['subject_slug'],$p);}
        return $plans;
    }
}
