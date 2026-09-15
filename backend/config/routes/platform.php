<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Repositories\ScheduleRepository;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Support\ContentStore;

return static function (Router $router): void {
    $router->get('/api/v1/dashboard', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $store = new ContentStore(); $homeworks = []; $tests = []; $profile = null;
        try { $profile = (new UserRepository())->profileBundle($req->user->id); } catch (\Throwable $e) {
            $profile = ['user' => $req->user->toArray(), 'roles' => $req->user->role ? [$req->user->role] : [], 'groups' => []];
        }
        try { $homeworks = (new HomeworkRepository())->listForUser($req->user->id); } catch (\Throwable $e) {}
        try { $tests = (new TestRepository())->listPublished(null); } catch (\Throwable $e) {}
        foreach ((new ContentStore())->listTestsLocal() as $lt) {
            if (!is_array($lt)) continue;
            if (isset($lt['is_published']) && !$lt['is_published']) continue;
            $tests[] = ['id' => $lt['id'] ?? null, 'title' => $lt['title'] ?? 'Тест', 'subject_name' => $lt['subject'] ?? null, 'source' => 'local'];
        }
        $schedule = [];
        try { $schedule = (new ScheduleRepository())->listForUser($req->user->id); } catch (\Throwable $e) {}
        Response::success(['profile'=>$profile,'site'=>$store->getSite(),'announcements'=>array_slice($store->listAnnouncements(),0,10),'schedule'=>$schedule,'homeworks'=>$homeworks,'tests'=>$tests], $req->requestId);
    });

    $router->get('/api/v1/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $from = isset($req->query['from']) ? trim((string)$req->query['from']) : null;
            $to = isset($req->query['to']) ? trim((string)$req->query['to']) : null;
            $items = (new ScheduleRepository())->listForUser($req->user->id, $from !== '' ? $from : null, $to !== '' ? $to : null);
            Response::success(['items'=>$items], $req->requestId);
        } catch (\Throwable $e) { Response::error('DB_UNAVAILABLE','Расписание временно недоступно',$req->requestId,503); }
    });

    $router->get('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher','moderator','admin'])) return;
        try {
            $groupId = isset($req->query['group_id']) ? trim((string)$req->query['group_id']) : null;
            $semester = isset($req->query['semester']) && $req->query['semester'] !== '' ? (int)$req->query['semester'] : null;
            Response::success(['items'=>(new ScheduleRepository())->listAll($groupId !== '' ? $groupId : null, $semester)], $req->requestId);
        } catch (\Throwable $e) { Response::error('DB_UNAVAILABLE','Не удалось загрузить расписание',$req->requestId,503); }
    });

    $router->put('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher','moderator','admin'])) return;
        try { Response::success((new ScheduleRepository())->replace($req->jsonBody ?? []), $req->requestId); }
        catch (\InvalidArgumentException $e) { Response::error('VALIDATION_ERROR',$e->getMessage(),$req->requestId,422); }
        catch (\Throwable $e) { Response::error('DB_ERROR','Не удалось сохранить расписание',$req->requestId,500); }
    });

    $router->get('/api/v1/curriculum', static function (Request $req, array $params): void { if (!RequireAuth::handle($req)) return; Response::success(['items'=>(new ContentStore())->listCurriculum()],$req->requestId); });
    $router->get('/api/v1/materials', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return; $groupId = isset($req->query['group_id']) ? (string)$req->query['group_id'] : null;
        try { Response::success(['items'=>(new FileRepository())->listActive($groupId)],$req->requestId); }
        catch (\Throwable $e) { Response::success(['items'=>[],'note'=>'files table unavailable'],$req->requestId); }
    });
    $router->get('/api/v1/community/posts', static function (Request $req, array $params): void { if (!RequireAuth::handle($req)) return; Response::success(['items'=>(new ContentStore())->listCommunityPosts()],$req->requestId); });
    $router->post('/api/v1/community/posts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $title=trim((string)$req->json('title','')); $body=trim((string)$req->json('body',''));
        if ($title==='' || $body==='') { Response::error('VALIDATION_ERROR','title and body required',$req->requestId,422); return; }
        $name=null; try { $bundle=(new UserRepository())->profileBundle($req->user->id); $name=$bundle['user']['full_name']??null; } catch (\Throwable $e) { $name=$req->user->email??'Студент'; }
        $row=(new ContentStore())->createCommunityPost(['title'=>$title,'body'=>$body,'author_id'=>$req->user->id,'author_name'=>is_string($name)?$name:'Студент']);
        Response::success(['post'=>$row],$req->requestId,201);
    });
    $router->get('/api/v1/progress', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return; $homeworks=[]; $attempts=[];
        try { $homeworks=(new HomeworkRepository())->listForUser($req->user->id); } catch (\Throwable $e) {}
        try { $attempts=(new TestRepository())->attemptsForUser($req->user->id); } catch (\Throwable $e) {}
        $hwTotal=count($homeworks); $hwDone=0; foreach($homeworks as $h){$st=(string)($h['my_status']??$h['status']??''); if(in_array($st,['submitted','graded','done','сдано','оценено'],true))$hwDone++;}
        $scores=[]; foreach($attempts as $a){if(isset($a['score'])&&is_numeric($a['score']))$scores[]=(float)$a['score'];}
        $avg=count($scores)?round(array_sum($scores)/count($scores),1):null;
        Response::success(['homework'=>['total'=>$hwTotal,'done'=>$hwDone,'items'=>$homeworks],'tests'=>['attempts'=>count($attempts),'avg_score'=>$avg,'items'=>$attempts]],$req->requestId);
    });
};
// synced 2026-09-15
