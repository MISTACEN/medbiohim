<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Support\ContentStore;

return static function (Router $r): void {
    $r->get('/api/v1/subjects-catalog', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $store = new ContentStore();
        $raw = method_exists($store, 'readRawSubjectsCatalog')
            ? $store->readRawSubjectsCatalog()
            : [];
        if (!is_array($raw)) $raw = [];
        Response::success([
            'items' => $raw['items'] ?? $store->listSubjectsCatalog(),
            'tools' => $raw['tools'] ?? [],
            'program' => $raw['program'] ?? null,
            'semester_label' => $raw['semester_label'] ?? null,
            'curriculum' => $store->curriculumPlan(),
        ], $q->requestId);
    });

    $r->get('/api/v1/subject-plans', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        Response::success(['plans' => (new ContentStore())->listSubjectPlans()], $q->requestId);
    });

    $r->get('/api/v1/subject-plans/{slug}', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $slug = (string) ($p['slug'] ?? '');
        $plan = (new ContentStore())->getSubjectPlan($slug);
        if ($plan === null) {
            Response::error('NOT_FOUND', 'План предмета не найден', $q->requestId, 404);
            return;
        }
        $name = (string) ($plan['subject'] ?? '');
        $sched = array_values(array_filter(
            (new ContentStore())->listSchedule(),
            static fn($row) => (string) ($row['subject_name'] ?? '') === $name
        ));
        Response::success(['plan' => $plan, 'schedule_count' => count($sched), 'schedule_sample' => array_slice($sched, 0, 5)], $q->requestId);
    });

    $r->get('/api/v1/lesson-plan', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $date = (string) ($q->query['date'] ?? '');
        $slug = (string) ($q->query['subject_slug'] ?? '');
        $subject = (string) ($q->query['subject'] ?? '');
        $store = new ContentStore();
        if (method_exists($store, 'findLessonPlan')) {
            Response::success($store->findLessonPlan($date !== '' ? $date : null, $subject !== '' ? $subject : null, $slug !== '' ? $slug : null), $q->requestId);
            return;
        }
        Response::success(['lesson' => null, 'weeks' => [], 'message' => 'findLessonPlan missing'], $q->requestId);
    });

    $r->put('/api/v1/admin/subject-plans', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        if (!RequireRole::handle($q, ['admin', 'moderator', 'teacher'])) return;
        $body = $q->jsonBody();
        $plans = $body['plans'] ?? null;
        if (!is_array($plans)) {
            Response::error('VALIDATION', 'plans array required', $q->requestId, 422);
            return;
        }
        $saved = (new ContentStore())->saveSubjectPlans($plans);
        Response::success(['plans' => $saved, 'count' => count($saved)], $q->requestId);
    });
};
