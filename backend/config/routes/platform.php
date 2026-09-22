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

    // --- ultra-safe probe (no heavy deps) ---
    $router->get('/api/v1/debug/ping', static function (Request $req, array $params): void {
        Response::success([
            'pong' => true,
            'php' => PHP_VERSION,
            'time' => date('c'),
            'has_ContentStore' => class_exists(ContentStore::class),
            'has_UserRepository' => class_exists(UserRepository::class),
            'has_ScheduleRepository' => class_exists(ScheduleRepository::class),
        ], $req->requestId);
    });

    $router->get('/api/v1/debug/dashboard-probe', static function (Request $req, array $params): void {
        $out = ['steps' => []];
        try {
            $out['steps'][] = 'php:'.PHP_VERSION;
            $out['steps'][] = 'ContentStore:'.(class_exists(ContentStore::class)?'yes':'no');
            if (class_exists(ContentStore::class)) {
                try {
                    $store = new ContentStore();
                    $out['steps'][] = 'site:ok';
                    try { $out['site'] = $store->getSite(); } catch (\Throwable $e) { $out['steps'][] = 'getSite:'.$e->getMessage(); }
                    try { $out['ann'] = count($store->listAnnouncements()); } catch (\Throwable $e) { $out['steps'][] = 'ann:'.$e->getMessage(); }
                    try { $out['sched_n'] = count($store->listSchedule()); } catch (\Throwable $e) { $out['steps'][] = 'sched:'.$e->getMessage(); }
                } catch (\Throwable $e) {
                    $out['steps'][] = 'ContentStore:'.$e->getMessage();
                }
            }
        } catch (\Throwable $e) {
            $out['steps'][] = 'fatal:'.$e->getMessage();
        }
        Response::success($out, $req->requestId);
    });

    // --- dashboard always 200 ---
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

    // --- schedule ---
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
        $from = isset($req->query['from']) ? trim((string)$req->query['from']) : '';
        $to = isset($req->query['to']) ? trim((string)$req->query['to']) : '';
        if ($from !== '') {
            $items = array_values(array_filter($items, static fn($x) => (string)($x['date'] ?? '') >= $from));
        }
        if ($to !== '') {
            $items = array_values(array_filter($items, static fn($x) => (string)($x['date'] ?? '') <= $to));
        }
        Response::success(['items' => $items, 'source' => $source], $req->requestId);
    });

    // --- admin schedule (was 404) ---
    $router->get('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $groupId = isset($req->query['group_id']) ? trim((string)$req->query['group_id']) : null;
        $semester = isset($req->query['semester']) && $req->query['semester'] !== '' ? (int)$req->query['semester'] : null;
        $items = [];
        $source = 'local';
        try {
            $items = (new ScheduleRepository())->listAll($groupId !== '' ? $groupId : null, $semester);
            if (is_array($items) && count($items) > 0) $source = 'db';
        } catch (\Throwable $e) {}
        if (!is_array($items) || count($items) === 0) {
            try {
                $store = new ContentStore();
                $items = $store->listSchedule();
                $source = 'local';
                Response::success(['items' => is_array($items)?$items:[], 'meta' => $store->scheduleMeta(), 'source' => $source], $req->requestId);
                return;
            } catch (\Throwable $e) {
                $items = [];
            }
        }
        Response::success(['items' => is_array($items)?$items:[], 'source' => $source], $req->requestId);
    });

    $router->put('/api/v1/admin/schedule/local', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        Response::error('GONE', 'Local JSON schedule storage has been retired. Use /api/v1/admin/schedule.', $req->requestId, 410);
    });

    $router->put('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        try {
            Response::success((new ScheduleRepository())->replace($req->jsonBody ?? []), $req->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success(SupabaseRest::replaceSchedule($req->jsonBody ?? []), $req->requestId);
            } catch (\Throwable $x) {
                Response::error('DB_ERROR', $x->getMessage(), $req->requestId, 500);
            }
        }
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
};
