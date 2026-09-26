<?php
declare(strict_types=1);

use MedbiohimHttpRequest;
use MedbiohimHttpResponse;
use MedbiohimHttpRouter;
use MedbiohimMiddlewareRequireAuth;
use MedbiohimSupportConnection;

return static function (Router $r): void {
    $loadCards = static function (Request $q): array {
        $db = Connection::pdo();
        $sql = 'SELECT id, subject_slug, specialty_slug, mode_set, preparation, question, hotspots, tags, difficulty, source_key
                FROM public.trainer_feed_cards
                WHERE is_published = true AND subject_slug = :subject AND specialty_slug = :specialty';
        $params = [
            'subject' => trim((string)($q->json('subject_slug', $q->query['subject'] ?? 'histology'))),
            'specialty' => trim((string)($q->json('specialty_slug', $q->query['specialty'] ?? 'mbh'))),
        ];
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            foreach (['preparation','question','hotspots','tags'] as $key) {
                if (isset($row[$key]) && is_string($row[$key])) {
                    $decoded = json_decode($row[$key], true);
                    if (is_array($decoded)) $row[$key] = $decoded;
                }
            }
        }
        unset($row);
        return is_array($rows) ? $rows : [];
    };

    $shuffle = static function (array $items): array {
        for ($i = count($items) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$items[$i], $items[$j]] = [$items[$j], $items[$i]];
        }
        return $items;
    };

    $buildOptions = static function (array $card, array $pool) use ($shuffle): array {
        $question = is_array($card['question'] ?? null) ? $card['question'] : [];
        $original = is_array($question['options'] ?? null) ? $question['options'] : [];
        $correct = null;
        $labels = [];

        foreach ($original as $o) {
            if (!is_array($o)) continue;
            $label = trim((string)($o['label'] ?? ''));
            if ($label === '') continue;
            if (($o['correct'] ?? false) === true && $correct === null) {
                $correct = ['id' => 'correct-' . substr(hash('sha256', (string)$card['id']), 0, 12), 'label' => $label, 'correct' => true];
            }
        }
        if ($correct === null) {
            foreach ($original as $o) {
                if (!is_array($o)) continue;
                $label = trim((string)($o['label'] ?? ''));
                if ($label !== '') {
                    $correct = ['id' => 'correct-' . substr(hash('sha256', (string)$card['id']), 0, 12), 'label' => $label, 'correct' => true];
                    break;
                }
            }
        }
        if ($correct === null) return [];

        $seen = [$correct['label'] => true];
        $distractors = [];
        $candidates = $pool;
        foreach ($candidates as $candidate) {
            if ((string)($candidate['id'] ?? '') === (string)$card['id']) continue;
            $cq = is_array($candidate['question'] ?? null) ? $candidate['question'] : [];
            foreach (($cq['options'] ?? []) as $o) {
                if (!is_array($o) || (($o['correct'] ?? false) === true)) continue;
                $label = trim((string)($o['label'] ?? ''));
                if ($label === '' || isset($seen[$label])) continue;
                $seen[$label] = true;
                $distractors[] = ['id' => 'opt-' . substr(hash('sha256', $card['id'] . '|' . $label), 0, 12), 'label' => $label, 'correct' => false];
            }
        }
        $distractors = $shuffle($distractors);
        $options = array_merge([$correct], array_slice($distractors, 0, 3));
        return $shuffle($options);
    };

    $sanitizeQuestion = static function (array $card, array $options, string $labelMode): array {
        $preparation = is_array($card['preparation'] ?? null) ? $card['preparation'] : [];
        $question = is_array($card['question'] ?? null) ? $card['question'] : [];
        if ($labelMode !== 'with') {
            unset($preparation['captions'], $preparation['name'], $preparation['organ'], $preparation['stain'], $preparation['sourceDocx']);
        }
        if ($labelMode === 'manual') {
            $options = [];
        }
        return [
            'id' => (string)$card['id'],
            'mode_set' => (string)($card['mode_set'] ?? ''),
            'preparation' => $preparation,
            'question' => [
                'prompt' => (string)($question['prompt'] ?? 'Что изображено?'),
                'explanation' => $labelMode === 'with' ? ($question['explanation'] ?? null) : null,
                'allowSkip' => true,
            ],
            'options' => $options,
            'hotspots' => $labelMode === 'with' ? ($card['hotspots'] ?? []) : [],
            'tags' => is_array($card['tags'] ?? null) ? $card['tags'] : [],
            'difficulty' => $card['difficulty'] ?? null,
            'source_key' => $card['source_key'] ?? null,
        ];
    };

    $r->get('/api/v1/trainings', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT id, subject_slug, specialty_slug, topics, content_type, question_count, label_mode, layout_mode,
                        status, current_index, score, total_questions, completed_at, created_at, updated_at
                 FROM public.trainings WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 50'
            );
            $stmt->execute(['uid' => $q->user->id]);
            Response::success(['items' => $stmt->fetchAll()], $q->requestId);
        } catch (Throwable $e) {
            Response::error('TRAINING_ERROR', $e->getMessage(), $q->requestId, 503);
        }
    });

    $r->post('/api/v1/trainings', static function (Request $q, array $p) use ($loadCards, $shuffle, $buildOptions, $sanitizeQuestion): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $db = Connection::pdo();
            $statusStmt = $db->prepare("SELECT id FROM public.trainings WHERE user_id=:uid AND status='in_progress' LIMIT 1");
            $statusStmt->execute(['uid'=>$q->user->id]);
            if ($statusStmt->fetch()) {
                Response::error('TRAINING_IN_PROGRESS', 'У вас уже есть незавершённая тренировка', $q->requestId, 409);
                return;
            }

            $topics = $q->json('topics', []);
            if (!is_array($topics)) $topics = [];
            $contentType = (string)$q->json('content_type', 'all');
            if (!in_array($contentType, ['all','preparation','electronogram'], true)) $contentType = 'all';
            $labelMode = (string)$q->json('label_mode', 'without');
            if (!in_array($labelMode, ['with','without','manual'], true)) $labelMode = 'without';
            $layoutMode = (string)$q->json('layout_mode', 'top');
            if (!in_array($layoutMode, ['sidebar','list','top'], true)) $layoutMode = 'top';
            $all = (bool)$q->json('all_questions', false);
            $requested = max(1, min(500, (int)$q->json('question_count', 20)));

            $cards = $loadCards($q);
            $cards = array_values(array_filter($cards, static function(array $card) use ($contentType, $topics): bool {
                if ($contentType !== 'all' && (string)($card['mode_set'] ?? '') !== $contentType) return false;
                if (!$topics) return true;
                $tags = is_array($card['tags'] ?? null) ? array_map('strval', $card['tags']) : [];
                return count(array_intersect($topics, $tags)) > 0;
            }));
            $cards = $shuffle($cards);
            if (!$all) $cards = array_slice($cards, 0, min($requested, count($cards)));
            if (!$cards) {
                Response::error('NO_QUESTIONS', 'По выбранным фильтрам карточек нет', $q->requestId, 422);
                return;
            }

            $questions = [];
            foreach ($cards as $card) {
                $options = $buildOptions($card, $cards);
                if (count($options) < 2) continue;
                $questions[] = $sanitizeQuestion($card, $options, $labelMode);
            }
            if (!$questions) {
                Response::error('NO_QUESTIONS', 'Не удалось сформировать варианты ответов', $q->requestId, 422);
                return;
            }

            $db->beginTransaction();
            $ins = $db->prepare(
                'INSERT INTO public.trainings
                 (user_id,subject_slug,specialty_slug,topics,content_type,question_count,label_mode,layout_mode,status,question_ids,total_questions)
                 VALUES (:uid,:subject,:specialty,:topics::jsonb,:ctype,:count,:label,:layout,\'in_progress\',:ids,:total)
                 RETURNING *'
            );
            $ids = array_map(static fn(array $x): string => (string)$x['id'], $questions);
            $ins->execute([
                'uid'=>$q->user->id,
                'subject'=>'histology',
                'specialty'=>'mbh',
                'topics'=>json_encode(array_values($topics), JSON_UNESCAPED_UNICODE),
                'ctype'=>$contentType,
                'count'=>$requested,
                'label'=>$labelMode,
                'layout'=>$layoutMode,
                'ids'=>'{' . implode(',', array_map(static fn(string $id): string => '"' . str_replace('"','\\"',$id) . '"', $ids)) . '}',
                'total'=>count($questions),
            ]);
            $training = $ins->fetch();

            $ans = $db->prepare(
                'INSERT INTO public.training_answers
                 (training_id,question_id,"order",options,question_snapshot,review_snapshot)
                 VALUES (:tid,:qid,:ord,:options::jsonb,:snapshot::jsonb,:review::jsonb)'
            );
            foreach ($questions as $i => $question) {
                $ans->execute([
                    'tid'=>$training['id'],
                    'qid'=>$question['id'],
                    'ord'=>$i,
                    'options'=>json_encode($question['options'], JSON_UNESCAPED_UNICODE),
                    'snapshot'=>json_encode($question, JSON_UNESCAPED_UNICODE),
                    'review'=>json_encode($cards[$i] ?? [], JSON_UNESCAPED_UNICODE),
                ]);
            }
            $db->commit();
            Response::success(['training'=>$training,'questions'=>$questions], $q->requestId, 201);
        } catch (Throwable $e) {
            if (Connection::pdo()->inTransaction()) Connection::pdo()->rollBack();
            Response::error('TRAINING_ERROR', $e->getMessage(), $q->requestId, 503);
        }
    });

    $r->get('/api/v1/trainings/{id}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $db=Connection::pdo();
            $stmt=$db->prepare('SELECT * FROM public.trainings WHERE id=:id AND user_id=:uid LIMIT 1');
            $stmt->execute(['id'=>(string)$p['id'],'uid'=>$q->user->id]);
            $training=$stmt->fetch();
            if (!$training) { Response::error('NOT_FOUND','Training not found',$q->requestId,404); return; }
            $a=$db->prepare('SELECT * FROM public.training_answers WHERE training_id=:tid ORDER BY "order"');
            $a->execute(['tid'=>$training['id']]);
            $answers=$a->fetchAll();
            foreach($answers as &$row){
                foreach(['options','question_snapshot'] as $key){
                    if(is_string($row[$key]??null)) $row[$key]=json_decode($row[$key],true) ?: [];
                }
            }
            unset($row);
            Response::success(['training'=>$training,'answers'=>$answers],$q->requestId);
        } catch(Throwable $e) { Response::error('TRAINING_ERROR',$e->getMessage(),$q->requestId,503); }
    });

    $r->post('/api/v1/trainings/{id}/answer', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $db=Connection::pdo();
            $stmt=$db->prepare('SELECT * FROM public.trainings WHERE id=:id AND user_id=:uid LIMIT 1');
            $stmt->execute(['id'=>(string)$p['id'],'uid'=>$q->user->id]);
            $training=$stmt->fetch();
            if(!$training){Response::error('NOT_FOUND','Training not found',$q->requestId,404);return;}
            if((string)$training['status']!=='in_progress'){Response::error('TRAINING_FINISHED','Training is already completed',$q->requestId,409);return;}
            $order=max(0,(int)$q->json('order',0));
            $answer=$q->json('user_answer',null);
            $isSkipped=(bool)$q->json('is_skipped',false);
            $row=$db->prepare('SELECT * FROM public.training_answers WHERE training_id=:tid AND "order"=:ord LIMIT 1');
            $row->execute(['tid'=>$training['id'],'ord'=>$order]);
            $current=$row->fetch();
            if(!$current){Response::error('NOT_FOUND','Training question not found',$q->requestId,404);return;}
            $options=is_string($current['options']??null)?(json_decode($current['options'],true)?:[]):($current['options']??[]);
            $correct=null;
            if(!$isSkipped && $answer!==null){
                foreach($options as $option){
                    if((string)($option['id']??'')===(string)$answer){$correct=(bool)($option['correct']??false);break;}
                }
            }
            $up=$db->prepare('UPDATE public.training_answers SET user_answer=:answer,is_correct=:correct,is_skipped=:skipped,answered_at=now() WHERE id=:id RETURNING *');
            $up->execute(['answer'=>$answer!==null?(string)$answer:null,'correct'=>$correct,'skipped'=>$isSkipped,'id'=>$current['id']]);
            $patch=$db->prepare('UPDATE public.trainings SET current_index=:idx,updated_at=now() WHERE id=:id');
            $patch->execute(['idx'=>$order,'id'=>$training['id']]);
            Response::success(['answer'=>$up->fetch(),'correct'=>$correct],$q->requestId);
        }catch(Throwable $e){Response::error('TRAINING_ERROR',$e->getMessage(),$q->requestId,503);}
    });

    $r->post('/api/v1/trainings/{id}/cancel', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $db=Connection::pdo();
            $u=$db->prepare("UPDATE public.trainings SET status='cancelled',updated_at=now() WHERE id=:id AND user_id=:uid RETURNING id,status");
            $u->execute(['id'=>(string)$p['id'],'uid'=>$q->user->id]);
            $row=$u->fetch();
            if(!$row){Response::error('NOT_FOUND','Training not found',$q->requestId,404);return;}
            Response::success(['training'=>$row],$q->requestId);
        } catch(Throwable $e) { Response::error('TRAINING_ERROR',$e->getMessage(),$q->requestId,503); }
    });

    $r->post('/api/v1/trainings/{id}/complete', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try{
            $db=Connection::pdo();
            $stmt=$db->prepare('SELECT * FROM public.trainings WHERE id=:id AND user_id=:uid LIMIT 1');
            $stmt->execute(['id'=>(string)$p['id'],'uid'=>$q->user->id]);
            $training=$stmt->fetch();
            if(!$training){Response::error('NOT_FOUND','Training not found',$q->requestId,404);return;}
            $s=$db->prepare('SELECT count(*) total, count(*) filter (where is_correct=true) correct, count(*) filter (where is_correct=false) wrong, count(*) filter (where user_answer is null) skipped FROM public.training_answers WHERE training_id=:id');
            $s->execute(['id'=>$training['id']]);
            $stats=$s->fetch() ?: ['total'=>0,'correct'=>0,'wrong'=>0,'skipped'=>0];
            $total=(int)$stats['total']; $correct=(int)$stats['correct'];
            $score=$total>0?round(($correct/$total)*100,1):0;
            $grade=$score>=90?5:($score>=75?4:($score>=60?3:2));
            $u=$db->prepare("UPDATE public.trainings SET status='completed',score=:score,current_index=:idx,completed_at=now(),updated_at=now() WHERE id=:id RETURNING *");
            $u->execute(['score'=>$score,'idx'=>max(0,$total-1),'id'=>$training['id']]);
            Response::success(['training'=>$u->fetch(),'stats'=>['total'=>$total,'correct'=>$correct,'wrong'=>(int)$stats['wrong'],'skipped'=>(int)$stats['skipped'],'percent'=>$score,'grade'=>$grade]],$q->requestId);
        }catch(Throwable $e){Response::error('TRAINING_ERROR',$e->getMessage(),$q->requestId,503);}
    });
};