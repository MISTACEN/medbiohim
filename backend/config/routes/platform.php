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
use Medbiohim\Services\ProgressService;
use Medbiohim\Services\ScheduleRestStore;
use Medbiohim\Services\SupabaseRest;
use Medbiohim\Support\ContentStore;

return static function (Router $router): void {
    $router->get('/api/v1/dashboard', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $profile = [
            'user' => $req->user->toArray(),
            'roles' => $req->user->role ? [$req->user->role] : [],
            'groups' => [],
        ];
        $homeworks = [];
        $tests = [];
        $schedule = [];
        $scheduleSource = 'none';
        $site = ['title' => 'Медбиохим'];
        $announcements = [];
        try {
            try {
                $profile = (new UserRepository())->profileBundle($req->user->id);
            } catch (\Throwable $e) {
                try { $profile = SupabaseRest::profileBundle($req->user->id); } catch (\Throwable $x) {}
            }
            try {
                $homeworks = (new HomeworkRepository())->listForUser($req->user->id);
                if (!is_array($homeworks)) $homeworks = [];
            } catch (\Throwable $e) { $homeworks = []; }
            try {
                $tests = (new TestRepository())->listPublished(null);
                if (!is_array($tests)) $tests = [];
            } catch (\Throwable $e) { $tests = []; }
            try {
                $store = new ContentStore();
                try { $site = $store->getSite(); } catch (\Throwable $e) {}
                try { $announcements = array_slice($store->listAnnouncements(), 0, 10); } catch (\Throwable $e) {}
                try {
                    $items = $store->listSchedule();
                    if (is_array($items) && count($items) > 0) {
                        $schedule = array_slice($items, 0, 60);
                        $scheduleSource = 'local';
                    }
                } catch (\Throwable $e) {}
            } catch (\Throwable $e) {}
            if ($scheduleSource === 'none') {
                try {
                    $items = (new ScheduleRepository())->listForUser($req->user->id);
                    if (is_array($items) && count($items) > 0) {
                        $schedule = array_slice($items, 0, 60);
                        $scheduleSource = 'db';
                    }
                } catch (\Throwable $e) {}
            }
        } catch (\Throwable $e) {}
        Response::success([
            'profile' => $profile,
            'site' => is_array($site) ? $site : ['title' => 'Медбиохим'],
            'announcements' => is_array($announcements) ? $announcements : [],
            'schedule' => is_array($schedule) ? $schedule : [],
            'schedule_source' => $scheduleSource,
            'homeworks' => is_array($homeworks) ? $homeworks : [],
            'tests' => is_array($tests) ? $tests : [],
        ], $req->requestId);
    });

    $router->get('/api/v1/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $items = [];
        $source = 'none';
        try {
            $store = new ContentStore();
            $items = $store->listSchedule();
            $source = 'local';
        } catch (\Throwable $e) {}
        try {
            if (!$items) {
                $items = (new ScheduleRepository())->listForUser($req->user->id);
                $source = 'db';
            }
        } catch (\Throwable $e) {}
        if (!is_array($items)) $items = [];
        Response::success(['items' => $items, 'source' => $source], $req->requestId);
    });

    $router->get('/api/v1/curriculum', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new ContentStore())->listCurriculum()], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => []], $req->requestId);
        }
    });

    $router->get('/api/v1/materials', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new FileRepository())->listActive(null)], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => []], $req->requestId);
        }
    });

    $router->get('/api/v1/community/posts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new ContentStore())->listCommunityPosts()], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => []], $req->requestId);
        }
    });

    $router->get('/api/v1/progress', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        Response::success([
            'overall_pct' => 0,
            'subjects' => [],
            'weak_topics' => [],
            'recent_activity' => [],
            'ledger' => ['count' => 0],
            'homework' => ['total' => 0, 'done' => 0, 'percent' => 0, 'items' => []],
            'tests' => ['attempts' => 0, 'finished' => 0, 'avg_score' => null, 'items' => []],
            'note' => 'degraded',
        ], $req->requestId);
    });

    $router->get('/api/v1/debug/dashboard-probe', static function (Request $req, array $params): void {
        $out = ['steps' => []];
        $uid = isset($req->query['uid']) ? (string)$req->query['uid'] : 'f67a1406-1bfa-4ea7-bd06-b433aceb113d';
        try {
            $out['steps'][] = 'profile:'.(is_array((new UserRepository())->profileBundle($uid)) ? 'ok' : 'bad');
        } catch (\Throwable $e) { $out['steps'][] = 'profile:'.$e->getMessage(); }
        try {
            $n = count((new ContentStore())->listSchedule());
            $out['steps'][] = 'schedule_local:'.$n;
        } catch (\Throwable $e) { $out['steps'][] = 'schedule:'.$e->getMessage(); }
        Response::success($out, $req->requestId);
    });
};
