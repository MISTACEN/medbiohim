<?php
declare(strict_types=1);

use MedbiohimDatabaseConnection;
use MedbiohimHttpRequest;
use MedbiohimHttpResponse;
use MedbiohimHttpRouter;
use MedbiohimMiddlewareRequireAuth;
use MedbiohimMiddlewareRequireRole;
use PDO;

return static function (Router $router): void {
    $router->post('/api/v1/admin/content/package/import', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['admin'])) return;

        $payload = is_array($req->jsonBody ?? null) ? $req->jsonBody : [];
        $specialty = trim((string) ($payload['specialty_slug'] ?? ''));
        $subjectSlug = trim((string) ($payload['subject_slug'] ?? ''));
        if ($subjectSlug === 'histology' && $specialty !== 'mbh') {
            Response::error('VALIDATION_ERROR', 'Histology package must be scoped to mbh.', $req->requestId, 422);
            return;
        }

        try {
            $db = Connection::pdo();
            $subjectId = trim((string) ($payload['subject_id'] ?? ''));
            if ($subjectId === '' && $subjectSlug !== '') {
                $s = $db->prepare('SELECT id FROM public.subjects WHERE slug = :slug ORDER BY semester NULLS LAST, id LIMIT 1');
                $s->execute(['slug' => $subjectSlug]);
                $subjectId = (string) ($s->fetchColumn() ?: '');
            }

            $stats = ['sources'=>0,'materials'=>0,'trainer_cards'=>0,'tests'=>0,'questions'=>0,'test_links'=>0];

            foreach (($payload['sources'] ?? []) as $row) {
                if (!is_array($row)) continue;
                $id = trim((string) ($row['id'] ?? ''));
                if ($id === '') continue;
                $sql = 'INSERT INTO public.content_sources
                          (id,title,source_path,mime_type,original_format,source_archive,note,file_id)
                         VALUES (:id,:title,:path,:mime,:format,:archive,:note,:file_id)
                         ON CONFLICT (id) DO UPDATE SET
                           title=excluded.title,source_path=excluded.source_path,mime_type=excluded.mime_type,
                           original_format=excluded.original_format,source_archive=excluded.source_archive,
                           note=excluded.note,file_id=excluded.file_id';
                $db->prepare($sql)->execute([
                    'id'=>$id,'title'=>(string)($row['title']??$id),'path'=>$row['source_path']??null,
                    'mime'=>$row['mime_type']??null,'format'=>$row['original_format']??null,
                    'archive'=>$row['source_archive']??'features.zip','note'=>$row['note']??null,
                    'file_id'=>($row['file_id']??null) ?: null,
                ]);
                $stats['sources']++;
            }

            foreach (($payload['materials'] ?? []) as $row) {
                if (!is_array($row) || empty($row['title']) || $subjectId === '') continue;
                $sourceKey = trim((string) ($row['source_key'] ?? ''));
                $found = null;
                if ($sourceKey !== '') {
                    $s = $db->prepare('SELECT id FROM public.materials WHERE source_key = :key LIMIT 1');
                    $s->execute(['key'=>$sourceKey]);
                    $found = $s->fetchColumn();
                }
                $data = [
                    'subject_id'=>$subjectId,'module_id'=>$row['module_id']??null,'topic_id'=>$row['topic_id']??null,
                    'type'=>$row['type']??'other','title'=>(string)$row['title'],'file_id'=>($row['file_id']??null) ?: null,
                    'external_url'=>$row['external_url']??null,'content_html'=>$row['content_html']??null,
                    'order_index'=>isset($row['order_index'])?(int)$row['order_index']:0,'is_published'=>($row['is_published']??true) !== false,
                    'source_key'=>$sourceKey !== '' ? $sourceKey : null,
                ];
                if ($found) {
                    $data['id']=$found;
                    $sql='UPDATE public.materials SET subject_id=:subject_id,module_id=:module_id,topic_id=:topic_id,
                          type=:type,title=:title,file_id=:file_id,external_url=:external_url,content_html=:content_html,
                          order_index=:order_index,is_published=:is_published,source_key=:source_key,updated_at=now() WHERE id=:id';
                } else {
                    $sql='INSERT INTO public.materials (subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,source_key)
                          VALUES (:subject_id,:module_id,:topic_id,:type,:title,:file_id,:external_url,:content_html,:order_index,:is_published,:source_key)';
                }
                $db->prepare($sql)->execute($data);
                $stats['materials']++;
            }

            foreach (($payload['trainer_cards'] ?? []) as $row) {
                if (!is_array($row) || trim((string)($row['id']??''))==='') continue;
                if ($subjectSlug === 'histology' && (($row['specialty_slug']??$specialty) !== 'mbh')) continue;
                $sql='INSERT INTO public.trainer_feed_cards
                      (id,subject_id,subject_slug,specialty_slug,mode_set,preparation,hotspots,question,tags,difficulty,source_key,source_file_id,is_published)
                      VALUES (:id,:subject_id,:subject_slug,:specialty_slug,:mode_set,:preparation::jsonb,:hotspots::jsonb,:question::jsonb,:tags::jsonb,:difficulty,:source_key,:source_file_id,true)
                      ON CONFLICT(id) DO UPDATE SET
                       subject_id=excluded.subject_id,subject_slug=excluded.subject_slug,specialty_slug=excluded.specialty_slug,
                       mode_set=excluded.mode_set,preparation=excluded.preparation,hotspots=excluded.hotspots,question=excluded.question,
                       tags=excluded.tags,difficulty=excluded.difficulty,source_key=excluded.source_key,
                       source_file_id=excluded.source_file_id,is_published=true,updated_at=now()';
                $db->prepare($sql)->execute([
                    'id'=>(string)$row['id'],'subject_id'=>$row['subject_id']??$subjectId,'subject_slug'=>$row['subject_slug']??$subjectSlug,
                    'specialty_slug'=>$row['specialty_slug']??$specialty,'mode_set'=>$row['mode_set']??'preparation',
                    'preparation'=>json_encode($row['preparation']??[],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
                    'hotspots'=>json_encode($row['hotspots']??[],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
                    'question'=>json_encode($row['question']??[],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
                    'tags'=>json_encode($row['tags']??[],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
                    'difficulty'=>isset($row['difficulty'])?(int)$row['difficulty']:null,
                    'source_key'=>$row['source_key']??null,'source_file_id'=>($row['source_file_id']??null) ?: null,
                ]);
                $stats['trainer_cards']++;
            }

            foreach (($payload['tests'] ?? []) as $row) {
                if (!is_array($row) || empty($row['title']) || $subjectId === '') continue;
                $testKey=trim((string)($row['source_key']??$row['id']??''));
                $found=null;
                if($testKey!==''){
                    $s=$db->prepare('SELECT id FROM public.tests WHERE source_key=:key LIMIT 1');
                    $s->execute(['key'=>$testKey]); $found=$s->fetchColumn();
                }
                $paramsTest=[
                    'subject_id'=>$row['subject_id']??$subjectId,'module_id'=>$row['module_id']??null,'topic_id'=>$row['topic_id']??null,
                    'title'=>(string)$row['title'],'time_limit_sec'=>isset($row['time_limit_sec'])?(int)$row['time_limit_sec']:null,
                    'max_attempts'=>isset($row['max_attempts'])?(int)$row['max_attempts']:3,'is_published'=>($row['is_published']??true)!==false,
                    'source_key'=>$testKey!==''?$testKey:null
                ];
                if($found){$paramsTest['id']=$found;$sql='UPDATE public.tests SET subject_id=:subject_id,module_id=:module_id,topic_id=:topic_id,title=:title,time_limit_sec=:time_limit_sec,max_attempts=:max_attempts,is_published=:is_published,source_key=:source_key WHERE id=:id';}
                else{$sql='INSERT INTO public.tests (subject_id,module_id,topic_id,title,time_limit_sec,max_attempts,is_published,source_key) VALUES (:subject_id,:module_id,:topic_id,:title,:time_limit_sec,:max_attempts,:is_published,:source_key) RETURNING id';}
                if($found){$db->prepare($sql)->execute($paramsTest);$testId=$found;} else {$st=$db->prepare($sql);$st->execute($paramsTest);$testId=$st->fetchColumn();}
                $stats['tests']++;
                $db->prepare('DELETE FROM public.test_questions WHERE test_id=:id')->execute(['id'=>$testId]);
                $order=0;
                foreach(($row['questions']??[]) as $q){
                    if(!is_array($q)||empty($q['text'])) continue;
                    $qKey=trim((string)($q['source_key']??$q['id']??''));
                    $qId=null;
                    if($qKey!==''){
                        $st=$db->prepare('SELECT id FROM public.questions WHERE source_key=:key LIMIT 1');
                        $st->execute(['key'=>$qKey]);$qId=$st->fetchColumn();
                    }
                    $qp=['subject_id'=>$q['subject_id']??$subjectId,'module_id'=>$q['module_id']??null,'topic_id'=>$q['topic_id']??null,'type'=>$q['type']??'mcq','text'=>(string)$q['text'],'answer'=>isset($q['answer'])?(string)$q['answer']:null,'options'=>json_encode($q['options']??[],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),'difficulty'=>isset($q['difficulty'])?(int)$q['difficulty']:null,'is_published'=>($q['is_published']??true)!==false,'source_key'=>$qKey!==''?$qKey:null];
                    if($qId){$qp['id']=$qId;$sql='UPDATE public.questions SET subject_id=:subject_id,module_id=:module_id,topic_id=:topic_id,type=:type,text=:text,answer=:answer,options=:options::jsonb,difficulty=:difficulty,is_published=:is_published,source_key=:source_key WHERE id=:id';$db->prepare($sql)->execute($qp);}
                    else{$sql='INSERT INTO public.questions (subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,source_key) VALUES (:subject_id,:module_id,:topic_id,:type,:text,:answer,:options::jsonb,:difficulty,:is_published,:source_key) RETURNING id';$st=$db->prepare($sql);$st->execute($qp);$qId=$st->fetchColumn();}
                    $st=$db->prepare('INSERT INTO public.test_questions(test_id,question_id,order_index) VALUES(:tid,:qid,:ord)');
                    $st->execute(['tid'=>$testId,'qid'=>$qId,'ord'=>$order++]);
                    $stats['questions']++; $stats['test_links']++;
                }
            }

            Response::success(['stats'=>$stats,'package_id'=>$payload['package_id']??null],$req->requestId,201);
        } catch (\Throwable $e) {
            Response::error('PACKAGE_IMPORT_FAILED',$e->getMessage(),$req->requestId,422);
        }
    });
};
