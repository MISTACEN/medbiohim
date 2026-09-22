-- Automatic synchronization of academic state from real student actions.
-- Applied to Supabase project gnobvyjywtqbdfeejxmf before committing to main.

create schema if not exists private;

create or replace function private.sync_student_academic_state(p_user_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r record; old_state record;
  new_learning text; new_academic text; new_execution text;
  ledger_status text; hw_status text;
  new_percent numeric; result numeric; result_max numeric; passing numeric;
  homework_id uuid; test_id uuid; has_evidence boolean;
begin
  if p_user_id is null then return; end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'academic sync user mismatch';
  end if;

  for r in
    select ci.* from public.curriculum_items ci
    where ci.is_active and ci.is_required
      and (ci.course_number is null or ci.course_number=(select course_number from public.users where id=p_user_id))
      and (ci.semester is null or ci.semester=(select semester from public.users where id=p_user_id))
  loop
    select * into old_state from public.student_academic_states
    where user_id=p_user_id and target_type='curriculum_item' and target_id=r.id;
    if coalesce(old_state.manual_override,false) then continue; end if;

    new_learning='not_started';
    new_academic=case when r.item_type in ('lecture','practice','lab','material','topic','subtopic') then 'not_required' else 'pending' end;
    new_execution=case when r.due_at is not null and r.due_at<now() then 'overdue' else 'not_done' end;
    new_percent=null; result=null; result_max=null; has_evidence=false; hw_status=null; ledger_status=null;

    if r.topic_id is not null then
      select p.percent,
        case when p.status::text='completed' or p.percent>=100 then 'completed'
             when p.percent>0 then 'in_progress' else 'not_started' end
      into new_percent,new_learning
      from public.user_topic_progress p where p.user_id=p_user_id and p.topic_id=r.topic_id;
      if new_percent is not null then has_evidence=true; end if;
    end if;

    if r.item_type='homework' then
      homework_id=null;
      if r.metadata ? 'homework_id' and (r.metadata->>'homework_id')~*'^[0-9a-f-]{36}$'
        then homework_id=(r.metadata->>'homework_id')::uuid; end if;
      if homework_id is not null then
        select hs.status,hs.grade into hw_status,result from public.homework_submissions hs
        where hs.homework_id=homework_id and hs.user_id=p_user_id order by hs.updated_at desc limit 1;
      else
        select hs.status,hs.grade into hw_status,result from public.homework_submissions hs
        join public.homeworks hw on hw.id=hs.homework_id
        where hs.user_id=p_user_id and hw.subject_id=r.subject_id and lower(hw.title)=lower(r.title)
        order by hs.updated_at desc limit 1;
      end if;
      if found then
        has_evidence=true; new_learning='completed'; new_execution='done';
        new_percent=case when result is not null then least(100,greatest(0,result)) else 100 end;
        if hw_status in ('graded','оценено') and result is not null then
          passing=coalesce(nullif(r.metadata->>'passing_percent','')::numeric,50);
          new_academic=case when result>=passing then 'passed' else 'failed' end; result_max=100;
        elsif hw_status in ('submitted','done','сдано') then new_academic='pending'; end if;
      end if;
    elsif r.item_type='test' then
      test_id=null;
      if r.metadata ? 'test_id' and (r.metadata->>'test_id')~*'^[0-9a-f-]{36}$'
        then test_id=(r.metadata->>'test_id')::uuid;
      elsif r.topic_id is not null then
        select t.id into test_id from public.tests t where t.topic_id=r.topic_id and t.subject_id=r.subject_id order by t.created_at desc limit 1;
      else
        select t.id into test_id from public.tests t where t.subject_id=r.subject_id and lower(t.title)=lower(r.title) order by t.created_at desc limit 1;
      end if;
      if test_id is not null then
        select a.percent,a.score,a.max_score into new_percent,result,result_max
        from public.test_attempts a where a.user_id=p_user_id and a.test_id=test_id and a.finished_at is not null
        order by a.finished_at desc limit 1;
        if found then
          has_evidence=true; passing=coalesce(nullif(r.metadata->>'passing_percent','')::numeric,70);
          new_learning=case when new_percent>=passing then 'completed' else 'in_progress' end;
          new_academic=case when new_percent>=passing then 'passed' else 'failed' end; new_execution='done';
        end if;
      end if;
    elsif r.item_type in ('credit','exam','colloquium','control_work','retake','makeup','ticket') then
      select pl.percent,pl.score,pl.max_score,pl.status into new_percent,result,result_max,ledger_status
      from public.progress_ledger pl
      where pl.user_id=p_user_id and (pl.object_id=r.id or pl.metadata->>'curriculum_item_id'=r.id::text)
      order by pl.updated_at desc limit 1;
      if found then
        has_evidence=true; passing=coalesce(nullif(r.metadata->>'passing_percent','')::numeric,70);
        new_execution=case when new_percent>=100 or lower(coalesce(ledger_status,'')) in ('done','completed','passed','finished') then 'done'
          when r.due_at is not null and r.due_at<now() then 'overdue' else 'not_done' end;
        if lower(coalesce(ledger_status,'')) in ('passed','completed','done','finished') or coalesce(new_percent,0)>=passing then
          new_academic='passed'; new_learning='completed';
        elsif lower(coalesce(ledger_status,'')) in ('failed','retake_required','failed_assessment') then
          new_academic='failed'; new_learning='in_progress';
        else new_academic='pending'; new_learning=case when coalesce(new_percent,0)>0 then 'in_progress' else 'not_started' end; end if;
      end if;
    end if;

    if not has_evidence and r.item_type not in ('lecture','practice','lab','material','topic','subtopic') then new_academic='pending'; end if;
    if new_learning='completed' and new_execution='overdue' then new_execution='done'; end if;

    insert into public.student_academic_states
      (user_id,target_type,target_id,subject_id,learning_status,academic_status,execution_status,manual_override,note,last_result,last_result_max,updated_at)
    values (p_user_id,'curriculum_item',r.id,r.subject_id,new_learning,new_academic,new_execution,false,
      'Автоматически синхронизировано с учебными действиями',result,result_max,now())
    on conflict (user_id,target_type,target_id) do update set
      subject_id=excluded.subject_id,learning_status=excluded.learning_status,academic_status=excluded.academic_status,
      execution_status=excluded.execution_status,note=excluded.note,last_result=excluded.last_result,
      last_result_max=excluded.last_result_max,updated_at=now()
    where public.student_academic_states.manual_override=false;

    if not exists (
      select 1 from public.academic_progress_history h where h.user_id=p_user_id and h.curriculum_item_id=r.id
      and h.learning_status=new_learning and h.academic_status=new_academic
      and coalesce(h.percent,-1)=coalesce(new_percent,-1) and h.recorded_at>now()-interval '10 minutes'
    ) then
      insert into public.academic_progress_history
      (user_id,subject_id,topic_id,curriculum_item_id,percent,learning_status,academic_status,source,metadata)
      values (p_user_id,r.subject_id,r.topic_id,r.id,new_percent,new_learning,new_academic,'auto_sync',
        jsonb_build_object('execution_status',new_execution,'item_type',r.item_type));
    end if;
  end loop;

  for r in
    select s.id subject_id from public.subjects s
    where s.is_active
      and (s.course_number is null or s.course_number=(select course_number from public.users where id=p_user_id))
      and (s.semester is null or s.semester=(select semester from public.users where id=p_user_id))
  loop
    select * into old_state from public.student_academic_states where user_id=p_user_id and target_type='subject' and target_id=r.subject_id;
    if coalesce(old_state.manual_override,false) then continue; end if;

    select coalesce(avg(p.percent),0) into new_percent
    from public.user_topic_progress p join public.topics t on t.id=p.topic_id join public.modules m on m.id=t.module_id
    where p.user_id=p_user_id and m.subject_id=r.subject_id;

    select count(*) filter(where academic_status='failed'),count(*) filter(where academic_status='retake_required'),
      count(*) filter(where academic_status='passed'),count(*)
    into result,result_max,passing,has_evidence
    from public.student_academic_states where user_id=p_user_id and target_type='curriculum_item'
      and subject_id=r.subject_id and academic_status<>'not_required';

    new_learning=case when coalesce(new_percent,0)>=100 then 'completed' when coalesce(new_percent,0)>0 then 'in_progress' else 'not_started' end;
    if result>0 or result_max>0 then new_academic='failed';
    elsif has_evidence>0 and passing=has_evidence then new_academic='passed'; else new_academic='pending'; end if;
    new_execution=case
      when exists(select 1 from public.student_academic_states x where x.user_id=p_user_id and x.target_type='curriculum_item' and x.subject_id=r.subject_id and x.execution_status='overdue') then 'overdue'
      when exists(select 1 from public.student_academic_states x where x.user_id=p_user_id and x.target_type='curriculum_item' and x.subject_id=r.subject_id and x.execution_status='not_done') then 'not_done'
      else 'done' end;

    insert into public.student_academic_states
      (user_id,target_type,target_id,subject_id,learning_status,academic_status,execution_status,manual_override,note,updated_at)
    values (p_user_id,'subject',r.subject_id,r.subject_id,new_learning,new_academic,new_execution,false,
      'Автоматически агрегировано из тем и академических требований',now())
    on conflict (user_id,target_type,target_id) do update set
      subject_id=excluded.subject_id,learning_status=excluded.learning_status,academic_status=excluded.academic_status,
      execution_status=excluded.execution_status,note=excluded.note,updated_at=now()
    where public.student_academic_states.manual_override=false;

    if not exists (
      select 1 from public.academic_progress_history h where h.user_id=p_user_id and h.subject_id=r.subject_id
      and h.curriculum_item_id is null and h.learning_status=new_learning and h.academic_status=new_academic
      and coalesce(h.percent,-1)=coalesce(new_percent,-1) and h.recorded_at>now()-interval '10 minutes'
    ) then
      insert into public.academic_progress_history
      (user_id,subject_id,percent,learning_status,academic_status,source,metadata)
      values (p_user_id,r.subject_id,new_percent,new_learning,new_academic,'auto_sync',
        jsonb_build_object('execution_status',new_execution,'aggregate',true));
    end if;
  end loop;
end;
$$;

create or replace function private.sync_student_academic_state_trigger()
returns trigger language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  perform private.sync_student_academic_state(coalesce(new.user_id,old.user_id));
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_sync_academic_topic_progress on public.user_topic_progress;
create trigger trg_sync_academic_topic_progress after insert or update on public.user_topic_progress
for each row execute function private.sync_student_academic_state_trigger();

drop trigger if exists trg_sync_academic_test_attempts on public.test_attempts;
create trigger trg_sync_academic_test_attempts after insert or update on public.test_attempts
for each row execute function private.sync_student_academic_state_trigger();

drop trigger if exists trg_sync_academic_homework_submissions on public.homework_submissions;
create trigger trg_sync_academic_homework_submissions after insert or update on public.homework_submissions
for each row execute function private.sync_student_academic_state_trigger();

drop trigger if exists trg_sync_academic_homework_progress on public.homework_progress;
create trigger trg_sync_academic_homework_progress after insert or update on public.homework_progress
for each row execute function private.sync_student_academic_state_trigger();

drop trigger if exists trg_sync_academic_progress_ledger on public.progress_ledger;
create trigger trg_sync_academic_progress_ledger after insert or update on public.progress_ledger
for each row execute function private.sync_student_academic_state_trigger();

revoke all on function private.sync_student_academic_state(uuid) from public,anon,authenticated;
revoke all on function private.sync_student_academic_state_trigger() from public,anon,authenticated;

create or replace function public.sync_my_academic_state()
returns void language plpgsql security invoker
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform private.sync_student_academic_state(auth.uid());
end;
$$;
grant execute on function public.sync_my_academic_state() to authenticated;
