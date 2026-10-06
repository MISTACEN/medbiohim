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
            $groupId = isset($req->query['group_id']) && trim((string)$req->query['group_id']) !== ''
                ? trim((string)$req->query['group_id']) : null;
            if ($groupId !== null) (new AcademicContextResolver())->assertGroupMember($req->user->id, $groupId);
            Response::success(['items' => (new HomeworkRepository())->listForUser($req->user->id, $groupId)], $req->requestId);
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
                    ? $resolver->assertGroupMember($req->user->id, $requestedGroup)
                    : null;
            } else {
                // Student-created shared homework must explicitly identify the group
                // when the student belongs to multiple groups.
                $group = $resolver->requireGroup($req->user->id, $requestedGroup);
            }

            $groupId = $group['group_id'] ?? null;
            if ($subjectId !== null && $subjectId !== '') {
                $resolver->resolveSubject($subjectId, $groupId);
            }

            $due = $req->json('due_at') !== null ? trim((string)$req->json('due_at')) : null;
            if (!$due && $req->json('due_date')) $due = trim((string)$req->json('due_date')).' 23:59:00';

            $payload = [
                'title'=>$title,
                'description'=>$req->json('description') !== null ? (string)$req->json('description') : null,
                'subject_id'=>$subjectId ?: null,
                'group_id'=>$groupId,
                'due_at'=>$due,
                'due_date'=>$req->json('due_date') ? (string)$req->json('due_date') : null,
                'created_by'=>$req->user->id,
                'created_by_role'=>$isStaff ? 'staff' : 'student'
            ];

            try {
                $row = (new HomeworkRepository())->create(
                    $payload['title'],$payload['description'],$payload['subject_id'],
                    $payload['group_id'],$payload['due_at'],$req->user->id,$payload['created_by_role']
                );
            } catch (\Throwable $primaryError) {
                // Fallback receives the already-resolved canonical group/subject;
                // it is never allowed to choose a different context.
                $row = SupabaseRest::createHomework($payload);
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
