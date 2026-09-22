<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use Medbiohim\Support\LlmGateway;
use PDO;

final class AcademicPlanningService
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function state(string $userId): array
    {
        $profile = $this->one("select id, full_name, course_number, semester from public.users where id=:u", [':u'=>$userId]) ?? [
            'id'=>$userId,'full_name'=>'Student','course_number'=>null,'semester'=>null
        ];

        $session = $this->one(
            "select id,title,type,start_date,end_date,course_number,semester,notes
             from public.academic_sessions
             where is_current=true
             order by coalesce(start_date,current_date) desc limit 1"
        );

        $plan = $this->one(
            "select count(*)::int as total,
                    count(*) filter (where item_type not in ('module','topic','subtopic'))::int as concrete
             from public.curriculum_items
             where is_active=true
               and (:course is null or course_number=:course)
               and (:semester is null or semester=:semester)",
            [':course'=>$profile['course_number'],':semester'=>$profile['semester']]
        ) ?? ['total'=>0,'concrete'=>0];

        $states = $this->all(
            "select s.id,s.target_type,s.target_id,s.subject_id,s.learning_status,s.academic_status,
                    s.execution_status,s.manual_override,s.note,s.last_result,s.last_result_max,
                    s.updated_at, coalesce(sub.name,'') as subject_name,
                    coalesce(t.title,'') as topic_name
             from public.student_academic_states s
             left join public.subjects sub on sub.id=s.subject_id
             left join public.topics t on t.id=s.target_id and s.target_type='topic'
             where s.user_id=:u
             order by s.updated_at desc",
            [':u'=>$userId]
        );

        $topicProgress = $this->all(
            "select p.topic_id,p.percent,p.status,p.last_activity_at,t.title as topic_name,
                    m.subject_id,sub.name as subject_name
             from public.user_topic_progress p
             join public.topics t on t.id=p.topic_id
             join public.modules m on m.id=t.module_id
             join public.subjects sub on sub.id=m.subject_id
             where p.user_id=:u
             order by p.last_activity_at desc nulls last",
            [':u'=>$userId]
        );

        $groupIds = $this->all(
            "select group_id from public.group_memberships where user_id=:u and is_active=true",
            [':u'=>$userId]
        );
        $groups = array_values(array_filter(array_map(static fn($r) => $r['group_id'] ?? null, $groupIds)));

        $scheduleSql = "select e.id,e.subject_id,e.subject_name,e.date,e.start_time,e.end_time,
                               e.type,e.event_kind,e.is_makeup,e.room,e.building,e.notes,
                               e.session_id
                        from public.schedule_entries e
                        where e.date >= current_date
                          and e.date <= current_date + 60
                          and coalesce(e.is_cancelled,false)=false";
        $params = [];
        if ($groups !== []) {
            $scheduleSql .= " and exists (select 1 from public.schedules sc where sc.id=e.schedule_id and sc.group_id = any(cast(:g as uuid[])))";
            $params[':g'] = '{' . implode(',', $groups) . '}';
        } else {
            $scheduleSql .= ' and false';
        }
        $scheduleSql .= " order by e.date,e.start_time limit 120";
        $schedule = $this->all($scheduleSql, $params);

        $debts = array_values(array_filter($states, static fn($s) => in_array((string)$s['academic_status'], ['failed','retake_required'], true)));
        $pending = array_values(array_filter($states, static fn($s) => (string)$s['academic_status']==='pending'));

        $upcoming = array_values(array_filter($schedule, static fn($e) =>
            in_array((string)$e['event_kind'], ['credit','exam','retake','makeup','colloquium','control_work','assessment'], true)
        ));

        $closed = count(array_filter($states, static fn($s) => (string)$s['academic_status']==='passed'));
        $inProgress = count(array_filter($states, static fn($s) => (string)$s['learning_status']==='in_progress'));
        $notStarted = count(array_filter($states, static fn($s) => (string)$s['learning_status']==='not_started'));
        $stateTotal = count($states);

        $weak = array_values(array_filter($topicProgress, static fn($p) =>
            isset($p['percent']) && is_numeric($p['percent']) && (float)$p['percent'] < 70
        ));

        $recommendations = $this->buildRecommendations($debts, $upcoming, $weak, $pending);

        return [
            'profile'=>$profile,
            'session'=>$session,
            'plan'=>[
                'available'=>((int)$plan['total']) > 0,
                'items'=>(int)$plan['total'],
                'concrete_items'=>(int)$plan['concrete'],
                'message'=>((int)$plan['total']) > 0 ? null : 'Официальный учебный план для текущего курса/семестра ещё не загружен.'
            ],
            'metrics'=>[
                'closed'=>$closed,
                'in_progress'=>$inProgress,
                'not_started'=>$notStarted,
                'debts'=>count($debts),
                'tracked'=>$stateTotal,
            ],
            'states'=>$states,
            'topic_progress'=>$topicProgress,
            'debts'=>$debts,
            'upcoming'=>$upcoming,
            'weak_topics'=>$weak,
            'recommendations'=>$recommendations,
            'generated_at'=>gmdate('c'),
        ];
    }

    public function saveState(string $userId, array $payload): array
    {
        $targetType = (string)($payload['target_type'] ?? '');
        $targetId = (string)($payload['target_id'] ?? '');
        if (!in_array($targetType, ['curriculum_item','topic','subject'], true) || !preg_match('/^[0-9a-f-]{36}$/i', $targetId)) {
            throw new \InvalidArgumentException('target_type и корректный target_id обязательны');
        }
        $subjectId = $payload['subject_id'] ?? null;
        $allowedLearning = ['not_started','in_progress','completed'];
        $allowedAcademic = ['not_required','pending','passed','failed','retake_required'];
        $allowedExecution = ['not_done','done','overdue'];
        $learning = (string)($payload['learning_status'] ?? 'not_started');
        $academic = (string)($payload['academic_status'] ?? 'not_required');
        $execution = (string)($payload['execution_status'] ?? 'not_done');
        if (!in_array($learning,$allowedLearning,true) || !in_array($academic,$allowedAcademic,true) || !in_array($execution,$allowedExecution,true)) {
            throw new \InvalidArgumentException('Недопустимый статус академического состояния');
        }

        $sql = "insert into public.student_academic_states
                (user_id,target_type,target_id,subject_id,learning_status,academic_status,execution_status,
                 manual_override,note,last_result,last_result_max,updated_at)
                values (:u,:tt,:tid,:sid,:ls,:as,:es,:mo,:note,:r,:rm,now())
                on conflict (user_id,target_type,target_id) do update set
                  subject_id=excluded.subject_id,learning_status=excluded.learning_status,
                  academic_status=excluded.academic_status,execution_status=excluded.execution_status,
                  manual_override=excluded.manual_override,note=excluded.note,
                  last_result=excluded.last_result,last_result_max=excluded.last_result_max,updated_at=now()
                returning *";
        $q=$this->db->prepare($sql);
        $q->execute([
            ':u'=>$userId,':tt'=>$targetType,':tid'=>$targetId,':sid'=>$subjectId ?: null,
            ':ls'=>$learning,':as'=>$academic,':es'=>$execution,
            ':mo'=>array_key_exists('manual_override',$payload) ? (bool)$payload['manual_override'] : true,
            ':note'=>$payload['note'] ?? null,':r'=>$payload['last_result'] ?? null,':rm'=>$payload['last_result_max'] ?? null
        ]);
        $row=$q->fetch() ?: [];
        $this->db->prepare("insert into public.academic_progress_history
            (user_id,subject_id,topic_id,curriculum_item_id,percent,learning_status,academic_status,source,metadata)
            values (:u,:sid,:tid,:cid,:pct,:ls,:as,'manual',:meta::jsonb)")
            ->execute([
                ':u'=>$userId,':sid'=>$subjectId ?: null,
                ':tid'=>$targetType==='topic' ? $targetId : null,
                ':cid'=>$targetType==='curriculum_item' ? $targetId : null,
                ':pct'=>$payload['percent'] ?? null,':ls'=>$learning,':as'=>$academic,
                ':meta'=>json_encode(['execution_status'=>$execution],JSON_UNESCAPED_UNICODE)
            ]);
        return $row;
    }

    public function generatePlan(string $userId): array
    {
        $state=$this->state($userId);
        $deterministic=$state['recommendations'];

        $context=[
            'profile'=>$state['profile'],
            'session'=>$state['session'],
            'official_plan'=>$state['plan'],
            'metrics'=>$state['metrics'],
            'debts'=>$state['debts'],
            'upcoming'=>$state['upcoming'],
            'weak_topics'=>array_slice($state['weak_topics'],0,30),
            'recommendations'=>$deterministic,
        ];
        $summary = 'План сформирован по фактам учебного состояния и расписания.';
        $provider = 'rule_engine';
        $model = null;
        try {
            $out=LlmGateway::chat([
                ['role'=>'system','content'=>'Ты AI-планировщик подготовки студента медицинского вуза. Используй только переданные факты. Не придумывай даты, экзамены, пересдачи, аудитории или темы. Если официальный учебный план отсутствует, прямо укажи это. Важнее всего закрытие академических долгов и ближайшие подтверждённые события расписания. Дай краткое резюме на русском языке.'],
                ['role'=>'user','content'=>json_encode($context,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]
            ], LlmGateway::TASK_CHAT, 0.2);
            $summary=$out['text'];
            $provider=$out['provider'];
            $model=$out['model'];
        } catch (\Throwable $e) {
            // Deterministic recommendations remain fully usable if LLM is unavailable.
        }

        $this->db->beginTransaction();
        try {
            $old=$this->db->prepare("update public.ai_study_plans set status='archived',updated_at=now() where user_id=:u and status='active'");
            $old->execute([':u'=>$userId]);
            $ins=$this->db->prepare("insert into public.ai_study_plans(user_id,session_id,status,title,summary,context_snapshot,generated_by,model)
                values(:u,:s,'active','Адаптивный план подготовки',:summary,:ctx::jsonb,:gen,:model) returning id");
            $ins->execute([
                ':u'=>$userId,':s'=>$state['session']['id'] ?? null,':summary'=>$summary,
                ':ctx'=>json_encode($context,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
                ':gen'=>$provider === 'rule_engine' ? 'rule_engine' : $provider,':model'=>$model
            ]);
            $planId=(string)$ins->fetchColumn();

            $item=$this->db->prepare("insert into public.ai_study_plan_items
                (plan_id,user_id,subject_id,topic_id,curriculum_item_id,schedule_entry_id,priority,action_type,title,reason,due_at,metadata)
                values(:p,:u,:sid,:tid,:cid,:eid,:priority,:action,:title,:reason,:due,:meta::jsonb)");
            foreach($deterministic as $r){
                $item->execute([
                    ':p'=>$planId,':u'=>$userId,':sid'=>$r['subject_id'] ?? null,':tid'=>$r['topic_id'] ?? null,
                    ':cid'=>$r['curriculum_item_id'] ?? null,':eid'=>$r['schedule_entry_id'] ?? null,
                    ':priority'=>$r['priority'],':action'=>$r['action_type'],':title'=>$r['title'],
                    ':reason'=>$r['reason'],':due'=>$r['due_at'] ?? null,
                    ':meta'=>json_encode(['source'=>'academic_state'],JSON_UNESCAPED_UNICODE)
                ]);
            }
            $this->db->commit();
            return ['plan'=>['id'=>$planId,'summary'=>$summary,'generated_by'=>$provider,'model'=>$model],
                    'items'=>$deterministic,'source_state'=>$state];
        } catch(\Throwable $e) {
            if($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    private function buildRecommendations(array $debts,array $upcoming,array $weak,array $pending): array
    {
        $out=[];
        foreach($debts as $d){
            $subject=(string)($d['subject_name'] ?? 'Предмет');
            $matches=array_values(array_filter($upcoming,static fn($e)=>
                (string)($e['subject_id'] ?? '')===(string)($d['subject_id'] ?? '') &&
                in_array((string)$e['event_kind'],['retake','makeup'],true)
            ));
            if($matches!==[]){
                $e=$matches[0];
                $when=trim((string)$e['date'].' '.substr((string)$e['start_time'],0,5));
                $where=trim(implode(', ',array_filter([(string)($e['building']??''),(string)($e['room']??'')]))); 
                $out[]=[
                    'priority'=>'urgent','action_type'=>'prepare_retake',
                    'title'=>$subject.' — пересдача/досдача',
                    'reason'=>'Академическое требование не закрыто; подтверждённое событие есть в расписании.',
                    'due_at'=>$e['date'].'T'.$e['start_time'],
                    'subject_id'=>$d['subject_id'] ?? null,'topic_id'=>$d['target_type']==='topic' ? $d['target_id'] : null,
                    'schedule_entry_id'=>$e['id'],
                    'event'=>$e,'when'=>$when,'where'=>$where
                ];
            } else {
                $out[]=[
                    'priority'=>'high','action_type'=>'close_debt',
                    'title'=>$subject.' — закрыть академический долг',
                    'reason'=>'Требование не закрыто. Дата пересдачи/досдачи пока не указана в расписании.',
                    'subject_id'=>$d['subject_id'] ?? null,'topic_id'=>$d['target_type']==='topic' ? $d['target_id'] : null
                ];
            }
        }
        foreach($upcoming as $e){
            if(in_array((string)$e['event_kind'],['retake','makeup'],true)) continue;
            $kind=(string)$e['event_kind'];
            $action=in_array($kind,['exam','credit'],true) ? ($kind==='exam'?'prepare_exam':'close_debt') : 'review';
            $out[]=[
                'priority'=>in_array($kind,['exam','credit'],true)?'urgent':'high',
                'action_type'=>$action,
                'title'=>((string)($e['subject_name']??'Предмет')).' — '.((string)($e['event_kind']??'событие')),
                'reason'=>'Подтверждённое событие ближайших 60 дней в расписании.',
                'due_at'=>$e['date'].'T'.$e['start_time'],
                'subject_id'=>$e['subject_id'] ?? null,
                'schedule_entry_id'=>$e['id'],'event'=>$e
            ];
        }
        foreach(array_slice($weak,0,10) as $p){
            $out[]=[
                'priority'=>(float)$p['percent']<40?'high':'normal','action_type'=>'study',
                'title'=>'Повторить: '.((string)($p['subject_name']??'Предмет')).' — '.((string)($p['topic_name']??'тема')),
                'reason'=>'Текущий учебный прогресс ниже 70%.',
                'subject_id'=>$p['subject_id'] ?? null,'topic_id'=>$p['topic_id'] ?? null
            ];
        }
        foreach(array_slice($pending,0,10) as $p){
            $out[]=[
                'priority'=>'high','action_type'=>'close_debt',
                'title'=>((string)($p['subject_name']??'Предмет')).' — незакрытое требование',
                'reason'=>'Требование отмечено как ожидающее закрытия.',
                'subject_id'=>$p['subject_id'] ?? null,
                'curriculum_item_id'=>$p['target_type']==='curriculum_item' ? $p['target_id'] : null
            ];
        }
        return array_slice($out,0,40);
    }

    private function one(string $sql,array $params=[]): ?array
    {
        $q=$this->db->prepare($sql); $q->execute($params); $r=$q->fetch();
        return $r===false?null:$r;
    }

    private function all(string $sql,array $params=[]): array
    {
        $q=$this->db->prepare($sql); $q->execute($params); return $q->fetchAll() ?: [];
    }
}
