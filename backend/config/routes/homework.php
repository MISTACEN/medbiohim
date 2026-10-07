<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Services\AcademicContextException;
use Medbiohim\Services\AcademicContextResolver;
use Medbiohim\Services\SupabaseRest;

return static function(Router $router): void {
    $router->get('/api/v1/homeworks', static function(Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $resolver = new AcademicContextResolver();
            $requestedGroup = isset($req->query['group_id']) && trim((string)$req->query['group_id']) !== ''
                ? trim((string)$req->query['group_id']) : null;
            $group = $resolver->requireGroup($req->user->id, $requestedGroup);
            $groupId = (string)$group['group_id'];
            Response::success(['items' => (new HomeworkRepository())->listForUser($req->user->id, $groupId), 'group' => $group], $req->requestId);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $req->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('homeworks_list_failed', ['requestId'=>$req->requestId,'error'=>$e->getMessage()]);
            Response::error('DB_UNAVAILABLE', 'Задания временно недоступны: база данных не отвечает', $req->requestId, 503);
        }
    });

    $router->post('/api/v1/homeworks', static function(Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $isStaff = in_array((string)$req->user->role, ['teacher','moderator','admin'], true);
        $title = trim((string)$req->json('title', ''));
        if ($title === '') { Response::error('VALIDATION_ERROR','title is required',$req->requestId,422); return; }

        try {
            $resolver = new AcademicContextResolver();
            $requestedGroup = $req->json('group_id') !== null ? trim((string)$req->json('group_id')) : null;
            $subjectId = $req->json('subject_id') !== null ? trim((string)$req->json('subject_id')) : null;

            if ($isStaff) {
                $group = $requestedGroup !== null && $requestedGroup !== ''
                    ? $resolver->assertActiveGroup($requestedGroup)
                    : null;
            } else {
                // Student-created shared homework must explicitly identify the group
                // when the student belongs to multiple groups.
                $group = $resolver->requireGroup($req->user->id, $requestedGroup);
            }

            if (!$isStaff && (!$group || (string)($group['role_in_group'] ?? '') !== 'starosta')) {
                Response::error('FORBIDDEN', 'Только староста группы может создавать общее ДЗ', $req->requestId, 403);
                return;
            }

            $groupId = $group['group_id'] ?? null;
            $scheduleEntryId = $req->json('schedule_entry_id') !== null
                ? trim((string)$req->json('schedule_entry_id')) : null;
            $dueDate = $req->json('due_date') !== null
                ? trim((string)$req->json('due_date')) : null;

            if ($scheduleEntryId !== null && $scheduleEntryId !== '') {
                if (!$groupId) {
                    Response::error('INVALID_LESSON_CONTEXT', 'Для привязки ДЗ к занятию нужна учебная группа', $req->requestId, 422);
                    return;
                }
                $lesson = $resolver->resolveLesson(
                    (string)$groupId,
                    $subjectId !== null && $subjectId !== '' ? $subjectId : null,
                    $dueDate !== null && $dueDate !== '' ? $dueDate : null,
                    null,
                    $scheduleEntryId
                );
                if ($lesson === null) {
                    Response::error('INVALID_LESSON_CONTEXT', 'Занятие не найдено в текущем расписании группы', $req->requestId, 422);
                    return;
                }
                if ($subjectId === null || $subjectId === '') {
                    $subjectId = $lesson['subject_id'] !== null ? (string)$lesson['subject_id'] : null;
                }
                if ($dueDate === null || $dueDate === '') {
                    $dueDate = (string)$lesson['date'];
                }
            } elseif ($subjectId !== null && $subjectId !== '') {
                $resolver->resolveSubject($subjectId, $groupId, $dueDate !== '' ? $dueDate : null);
            }

            $due = $req->json('due_at') !== null ? trim((string)$req->json('due_at')) : null;
            if (!$due && $dueDate) $due = $dueDate.' 23:59:00';

            $rawAttachments = $req->json('attachment_file_ids');
            if ($rawAttachments !== null && !is_array($rawAttachments)) {
                Response::error('VALIDATION_ERROR', 'attachment_file_ids must be an array', $req->requestId, 422);
                return;
            }
            $attachmentFileIds = array_values(array_unique(array_filter(array_map(
                static fn($id): string => trim((string)$id),
                is_array($rawAttachments) ? $rawAttachments : []
            ))));
            if (count($attachmentFileIds) > 12) {
                Response::error('VALIDATION_ERROR', 'Можно прикрепить не более 12 файлов', $req->requestId, 422);
                return;
            }

            $payload = [
                'title'=>$title,
                'description'=>$req->json('description') !== null ? (string)$req->json('description') : null,
                'subject_id'=>$subjectId ?: null,
                'group_id'=>$groupId,
                'schedule_entry_id'=>$scheduleEntryId ?: null,
                'due_at'=>$due,
                'due_date'=>$dueDate ?: null,
                'attachment_file_ids'=>$attachmentFileIds,
                'created_by'=>$req->user->id,
                'created_by_role'=>$isStaff ? 'staff' : 'student'
            ];

            try {
                $row = (new HomeworkRepository())->create(
                    $payload['title'],$payload['description'],$payload['subject_id'],
                    $payload['group_id'],$payload['due_at'],$req->user->id,$payload['created_by_role'],
                    $payload['schedule_entry_id'],$payload['due_date'],$payload['attachment_file_ids']
                );
            } catch (\Throwable $primaryError) {
                // Fallback receives the already-resolved canonical group/subject;
                // it is never allowed to choose a different context.
                $row = SupabaseRest::createHomework($payload);
                if (!empty($payload['attachment_file_ids']) && !empty($row['id'])) {
                    SupabaseRest::attachHomeworkFiles(
                        (string)$row['id'],
                        $payload['attachment_file_ids'],
                        (string)$req->user->id,
                        $payload['group_id'] !== null ? (string)$payload['group_id'] : null
                    );
                }
            }
            Response::success($row, $req->requestId, 201);
        } catch (AcademicContextException $e) {
            Response::error($e->errorCode, $e->getMessage(), $req->requestId, $e->httpStatus, $e->details);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR','Could not create homework',$req->requestId,503);
        }
    });

    $router->post('/api/v1/homeworks/{id}/submit', static function(Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $repo = new HomeworkRepository();
            $uid = (string)$req->user->id;
            $homework = $repo->findAccessibleById((string)$params['id'], $uid);
            if ($homework === null) {
                Response::error('HOMEWORK_NOT_ACCESSIBLE','Homework is not accessible in your academic context',$req->requestId,403);
                return;
            }

            $resolver = new AcademicContextResolver();
            $group = !empty($homework['group_id'])
                ? $resolver->assertGroupMember($uid,(string)$homework['group_id'])
                : $resolver->requireGroup($uid);
            if (!empty($homework['subject_id'])) {
                $resolver->resolveSubject((string)$homework['subject_id'],(string)$group['group_id']);
            }

            $fileId = $req->json('file_id') ? trim((string)$req->json('file_id')) : null;
            if ($fileId !== null && $fileId !== '') $repo->assertSubmissionFileAccess($fileId, $uid, (string)$params['id']);

            $text = $req->json('text_answer') !== null ? (string)$req->json('text_answer') : null;
            try {
                $row = $repo->submit((string)$params['id'],$uid,$text,$fileId);
            } catch (\Throwable $primaryError) {
                $row = SupabaseRest::submitHomework((string)$params['id'],$uid,$text,$fileId);
            }
            Response::success(['submission'=>$row],$req->requestId,201);
        } catch (\RuntimeException $e) {
            Response::error('FORBIDDEN',$e->getMessage(),$req->requestId,403);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR','Could not submit homework',$req->requestId,503);
        }
    });

    $router->post('/api/v1/submissions/{id}/grade', static function(Request $req,array $params):void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req,['teacher','moderator','admin'])) return;
        $raw=$req->json('grade',null);
        if($raw===null||$raw===''||!is_numeric($raw)){Response::error('VALIDATION_ERROR','grade is required and must be numeric',$req->requestId,422);return;}
        $grade=(float)$raw;
        if($grade<0||$grade>100){Response::error('VALIDATION_ERROR','grade must be between 0 and 100',$req->requestId,422);return;}
        try{
            $row=(new HomeworkRepository())->grade((string)$params['id'],$grade,$req->json('comment')!==null?(string)$req->json('comment'):null);
            if($row===null){Response::error('NOT_FOUND','Submission not found',$req->requestId,404);return;}
            Response::success(['submission'=>$row],$req->requestId);
        }catch(\Throwable $e){Response::error('DB_ERROR','Could not grade submission',$req->requestId,503);}
    });
};
