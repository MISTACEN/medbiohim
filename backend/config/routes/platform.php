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
    $normalizeSchedule = static function (array $items): array {
        $subjectCache = [];
        $groupCache = [];
        foreach ($items as &$item) {
            if (!is_array($item)) continue;
            if (empty($item['subject_name']) && !empty($item['subject_id'])) {
                $sid = (string) $item['subject_id'];
                if (!array_key_exists($sid, $subjectCache)) {
                    try { $subjectCache[$sid] = SupabaseRest::getSubject($sid); } catch (\Throwable $e) { $subjectCache[$sid] = null; }
                }
                if (is_array($subjectCache[$sid])) $item['subject_name'] = $subjectCache[$sid]['name'] ?? null;
            }
            if (!empty($item['group_id'])) {
                $gid = (string) $item['group_id'];
                if (!array_key_exists($gid, $groupCache)) {
                    try { $groupCache[$gid] = SupabaseRest::getGroup($gid); } catch (\Throwable $e) { $groupCache[$gid] = null; }
                }
                $group = is_array($groupCache[$gid]) ? ($groupCache[$gid]['group'] ?? null) : null;
                if (is_array($group)) {
                    $item['group_name'] = $group['name'] ?? ($item['group_name'] ?? null);
                    $item['group_code'] = $group['code'] ?? ($item['group_code'] ?? null);
                    $item['course_number'] = $group['course_number'] ?? ($item['course_number'] ?? null);
                }
            }
            if (empty($item['subject_name']) && !empty($item['subject'])) $item['subject_name'] = $item['subject'];
        }
        unset($item);
        usort($items, static fn($a, $b): int => ((string)($a['date'] ?? '') . ' ' . (string)($a['start_time'] ?? '')) <=> ((string)($b['date'] ?? '') . ' ' . (string)($b['start_time'] ?? '')));
        return array_values($items);
    };

    $loadSchedule = static function (string $userId, ?string $from = null, ?string $to = null) use ($normalizeSchedule): array {
        try { return ['items' => ScheduleRestStore::listForUser($userId, $from, $to), 'source' => 'supabase']; } catch (\Throwable $e) {}
        try { return ['items' => (new ScheduleRepository())->listForUser($userId, $from, $to), 'source' => 'db']; } catch (\Throwable $e) {}
        try { return ['items' => SupabaseRest::listScheduleForUser($userId, $from, $to), 'source' => 'supabase-rest']; } catch (\Throwable $e) {}
        $store = new ContentStore();
        $items = $store->listSchedule();
        if ($from) $items = array_values(array_filter($items, static fn($x) => (string)($x['date'] ?? '') >= $from));
        if ($to) $items = array_values(array_filter($items, static fn($x) => (string)($x['date'] ?? '') <= $to));
        return ['items' => $normalizeSchedule($items), 'source' => 'local'];
    };

    $router->get('/api/v1/dashboard', static function (Request $req, array $params) use ($loadSchedule): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $store = new ContentStore();
            $homeworks = [];
            $tests = [];
            $profile = [
                'user' => $req->user->toArray(),
                'roles' => $req->user->role ? [$req->user->role] : [],
                'groups' => [],
            ];
            try {
                $profile = (new UserRepository())->profileBundle($req->user->id);
            } catch (\Throwable $e) {
                try { $profile = SupabaseRest::profileBundle($req->user->id); } catch (\Throwable $x) {}
            }
            try {
                $homeworks = (new HomeworkRepository())->listForUser($req->user->id);
            } catch (\Throwable $e) {
                try { $homeworks = SupabaseRest::listHomeworksForUser($req->user->id); } catch (\Throwable $x) { $homeworks = []; }
            }
            try {
                $tests = (new TestRepository())->listPublished(null);
            } catch (\Throwable $e) {
                $tests = [];
            }
            try {
                foreach ($store->listTestsLocal() as $lt) {
                    if (!is_array($lt)) continue;
                    if (isset($lt['is_published']) && !$lt['is_published']) continue;
                    $tests[] = [
                        'id' => $lt['id'] ?? null,
                        'title' => $lt['title'] ?? 'Тест',
                        'subject_name' => $lt['subject'] ?? null,
                        'source' => 'local',
                    ];
                }
            } catch (\Throwable $e) {}
            $scheduleResult = ['items' => [], 'source' => 'none'];
            try {
                $scheduleResult = $loadSchedule($req->user->id);
            } catch (\Throwable $e) {
                try {
                    $scheduleResult = ['items' => array_slice($store->listSchedule(), 0, 40), 'source' => 'local'];
                } catch (\Throwable $x) {}
            }
            $site = ['title' => 'Медбиохим'];
            $announcements = [];
            try { $site = $store->getSite(); } catch (\Throwable $e) {}
            try { $announcements = array_slice($store->listAnnouncements(), 0, 10); } catch (\Throwable $e) {}
            Response::success([
                'profile' => $profile,
                'site' => $site,
                'announcements' => $announcements,
                'schedule' => is_array($scheduleResult['items'] ?? null) ? $scheduleResult['items'] : [],
                'schedule_source' => $scheduleResult['source'] ?? 'unknown',
                'homeworks' => is_array($homeworks) ? $homeworks : [],
                'tests' => is_array($tests) ? $tests : [],
            ], $req->requestId);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('dashboard_failed', [
                'requestId' => $req->requestId,
                'message' => $e->getMessage(),
            ]);
            Response::success([
                'profile' => [
                    'user' => $req->user->toArray(),
                    'roles' => $req->user->role ? [$req->user->role] : [],
                    'groups' => [],
                ],
                'site' => ['title' => 'Медбиохим'],
                'announcements' => [],
                'schedule' => [],
                'schedule_source' => 'error',
                'homeworks' => [],
                'tests' => [],
                'note' => 'dashboard soft-fail: ' . $e->getMessage(),
            ], $req->requestId);
        }
    });

    $router->get('/api/v1/schedule', static function (Request $req, array $params) use ($loadSchedule): void {
        if (!RequireAuth::handle($req)) return;
        $from = isset($req->query['from']) ? trim((string) $req->query['from']) : null;
        $to = isset($req->query['to']) ? trim((string) $req->query['to']) : null;
        $from = $from !== '' ? $from : null;
        $to = $to !== '' ? $to : null;
        try {
            $result = $loadSchedule($req->user->id, $from, $to);
        } catch (\Throwable $e) {
            $result = ['items' => [], 'source' => 'error'];
        }
        $items = is_array($result['items'] ?? null) ? $result['items'] : [];
        $meta = [];
        if ($items) {
            $first = $items[0];
            $meta = [
                'group_name' => $first['group_name'] ?? null,
                'group_code' => $first['group_code'] ?? null,
                'course_number' => $first['course_number'] ?? null,
                'semester' => $first['semester'] ?? null,
                'academic_year' => $first['academic_year'] ?? '2026/2027',
                'version' => $first['version'] ?? null,
            ];
        }
        Response::success(['items' => $items, 'meta' => $meta, 'source' => $result['source'] ?? 'unknown'], $req->requestId);
    });

    $router->get('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $groupId = isset($req->query['group_id']) ? trim((string) $req->query['group_id']) : null;
        $semester = isset($req->query['semester']) && $req->query['semester'] !== '' ? (int) $req->query['semester'] : null;
        $items = [];
        $source = 'db';
        try {
            $items = (new ScheduleRepository())->listAll($groupId !== '' ? $groupId : null, $semester);
        } catch (\Throwable $e) {
            try {
                $items = SupabaseRest::listSchedule($groupId !== '' ? $groupId : null, $semester);
                $source = 'supabase';
            } catch (\Throwable $x) {
                $items = [];
            }
        }
        if (!is_array($items) || count($items) === 0) {
            $store = new ContentStore();
            $items = $store->listSchedule();
            $source = 'local';
            Response::success(['items' => $items, 'meta' => $store->scheduleMeta(), 'source' => $source], $req->requestId);
            return;
        }
        Response::success(['items' => $items, 'source' => $source], $req->requestId);
    });

    $router->put('/api/v1/admin/schedule/local', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $items = $req->json('items');
        if (!is_array($items)) {
            Response::error('VALIDATION_ERROR', 'items array required', $req->requestId, 422);
            return;
        }
        $store = new ContentStore();
        $meta = $store->scheduleMeta();
        $payload = [
            'meta' => $meta ?: ['title' => 'Расписание', 'group_code' => 'МБ-201'],
            'items' => array_values($items),
            'updated_at' => gmdate('c'),
            'count' => count($items),
            'source' => 'admin_cms',
        ];
        $dir = dirname(__DIR__, 2) . '/data';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        file_put_contents($dir . '/schedule.json', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL, LOCK_EX);
        Response::success(['items' => $items, 'count' => count($items), 'source' => 'local'], $req->requestId);
    });

    $router->put('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        try {
            Response::success((new ScheduleRepository())->replace($req->jsonBody ?? []), $req->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\Throwable $e) {
            try {
                Response::success(SupabaseRest::replaceSchedule($req->jsonBody ?? []), $req->requestId);
            } catch (\InvalidArgumentException $x) {
                Response::error('VALIDATION_ERROR', $x->getMessage(), $req->requestId, 422);
            } catch (\Throwable $x) {
                Response::error('DB_ERROR', 'Не удалось сохранить расписание', $req->requestId, 500);
            }
        }
    });

    $router->get('/api/v1/curriculum', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        Response::success(['items' => (new ContentStore())->listCurriculum()], $req->requestId);
    });
    $router->get('/api/v1/materials', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $groupId = isset($req->query['group_id']) ? (string) $req->query['group_id'] : null;
        try {
            Response::success(['items' => (new FileRepository())->listActive($groupId)], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => [], 'note' => 'files table unavailable'], $req->requestId);
        }
    });
    $router->get('/api/v1/community/posts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        Response::success(['items' => (new ContentStore())->listCommunityPosts()], $req->requestId);
    });
    $router->post('/api/v1/community/posts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $title = trim((string) $req->json('title', ''));
        $body = trim((string) $req->json('body', ''));
        if ($title === '' || $body === '') {
            Response::error('VALIDATION_ERROR', 'title and body required', $req->requestId, 422);
            return;
        }
        $name = null;
        try {
            $bundle = (new UserRepository())->profileBundle($req->user->id);
            $name = $bundle['user']['full_name'] ?? null;
        } catch (\Throwable $e) {
            $name = $req->user->email ?? 'Студент';
        }
        $row = (new ContentStore())->createCommunityPost([
            'title' => $title,
            'body' => $body,
            'author_id' => $req->user->id,
            'author_name' => is_string($name) ? $name : 'Студент',
        ]);
        Response::success(['post' => $row], $req->requestId, 201);
    });

    $router->get('/api/v1/progress', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(ProgressService::forUser($req->user->id), $req->requestId);
            return;
        } catch (\Throwable $e) {
        }
        $homeworks = [];
        $attempts = [];
        try {
            $homeworks = (new HomeworkRepository())->listForUser($req->user->id);
        } catch (\Throwable $e) {
            try { $homeworks = SupabaseRest::listHomeworksForUser($req->user->id); } catch (\Throwable $x) {}
        }
        try {
            $attempts = (new TestRepository())->attemptsForUser($req->user->id);
        } catch (\Throwable $e) {
        }
        $hwTotal = count($homeworks);
        $hwDone = 0;
        foreach ($homeworks as $h) {
            $st = (string) ($h['my_status'] ?? $h['status'] ?? '');
            if (in_array($st, ['submitted', 'graded', 'done', 'сдано', 'оценено'], true)) $hwDone++;
        }
        $scores = [];
        foreach ($attempts as $a) {
            if (isset($a['score']) && is_numeric($a['score'])) $scores[] = (float) $a['score'];
        }
        $avg = count($scores) ? round(array_sum($scores) / count($scores), 1) : null;
        Response::success([
            'overall_pct' => 0,
            'subjects' => [],
            'weak_topics' => [],
            'recent_activity' => [],
            'ledger' => ['count' => 0],
            'homework' => [
                'total' => $hwTotal,
                'done' => $hwDone,
                'percent' => $hwTotal ? round($hwDone / $hwTotal * 100, 1) : 0,
                'items' => $homeworks,
            ],
            'tests' => [
                'attempts' => count($attempts),
                'finished' => count(array_filter($attempts, static fn($a) => !empty($a['finished_at']))),
                'avg_score' => $avg,
                'items' => $attempts,
            ],
            'note' => 'degraded',
        ], $req->requestId);
    });
};
