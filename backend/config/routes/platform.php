<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Support\ContentStore;

return static function (Router $router): void {
    $router->get('/api/v1/dashboard', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $store = new ContentStore();
        $homeworks = [];
        $tests = [];
        $profile = null;
        try {
            $profile = (new UserRepository())->profileBundle($req->user->id);
        } catch (\Throwable $e) {
            $profile = [
                'user' => $req->user->toArray(),
                'roles' => $req->user->role ? [$req->user->role] : [],
                'groups' => [],
            ];
        }
        try {
            $homeworks = (new HomeworkRepository())->listForUser($req->user->id);
        } catch (\Throwable $e) {
            $homeworks = [];
        }
        try {
            $tests = (new TestRepository())->listPublished(null);
        } catch (\Throwable $e) {
            $tests = [];
        }
        Response::success([
            'profile' => $profile,
            'site' => $store->getSite(),
            'announcements' => array_slice($store->listAnnouncements(), 0, 10),
            'schedule' => $store->listSchedule(),
            'homeworks' => $homeworks,
            'tests' => $tests,
        ], $req->requestId);
    });

    $router->get('/api/v1/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        Response::success(['items' => (new ContentStore())->listSchedule()], $req->requestId);
    });

    $router->put('/api/v1/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        if (!RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) {
            return;
        }
        $items = $req->json('items');
        if (!is_array($items)) {
            Response::error('VALIDATION_ERROR', 'items array required', $req->requestId, 422);
            return;
        }
        $saved = (new ContentStore())->saveSchedule($items);
        Response::success(['items' => $saved], $req->requestId);
    });

    $router->get('/api/v1/materials', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $groupId = isset($req->query['group_id']) ? (string) $req->query['group_id'] : null;
        try {
            $items = (new FileRepository())->listActive($groupId);
            Response::success(['items' => $items], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => [], 'note' => 'files table unavailable'], $req->requestId);
        }
    });

    $router->get('/api/v1/community/posts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        Response::success(['items' => (new ContentStore())->listCommunityPosts()], $req->requestId);
    });

    $router->post('/api/v1/community/posts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
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
        if (!RequireAuth::handle($req)) {
            return;
        }
        $homeworks = [];
        $attempts = [];
        try {
            $homeworks = (new HomeworkRepository())->listForUser($req->user->id);
        } catch (\Throwable $e) {
        }
        try {
            $attempts = (new TestRepository())->attemptsForUser($req->user->id);
        } catch (\Throwable $e) {
        }
        $hwTotal = count($homeworks);
        $hwDone = 0;
        foreach ($homeworks as $h) {
            $st = (string) ($h['my_status'] ?? $h['status'] ?? '');
            if (in_array($st, ['submitted', 'graded', 'done', 'сдано', 'оценено'], true)) {
                $hwDone++;
            }
        }
        $scores = [];
        foreach ($attempts as $a) {
            if (isset($a['score']) && is_numeric($a['score'])) {
                $scores[] = (float) $a['score'];
            }
        }
        $avg = count($scores) ? round(array_sum($scores) / count($scores), 1) : null;
        Response::success([
            'homework' => ['total' => $hwTotal, 'done' => $hwDone, 'items' => $homeworks],
            'tests' => ['attempts' => count($attempts), 'avg_score' => $avg, 'items' => $attempts],
        ], $req->requestId);
    });
};
