<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Support\ContentStore;

return static function (Router $r): void {
    $r->get('/api/v1/subjects-catalog', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $store = new ContentStore();
        Response::success([
            'items' => $store->listSubjectsCatalog(),
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
        $plan = null;
        if ($slug !== '') {
            $plan = $store->getSubjectPlan($slug);
        } elseif ($subject !== '') {
            foreach ($store->listSubjectPlans() as $pl) {
                if (mb_strtolower((string) ($pl['subject'] ?? '')) === mb_strtolower($subject)) {
                    $plan = $pl;
                    break;
                }
            }
        }
        if ($plan === null) {
            Response::success(['lesson' => null, 'message' => 'План не загружен для этого предмета'], $q->requestId);
            return;
        }
        $week = null;
        if ($date !== '' && !empty($plan['weeks']) && is_array($plan['weeks'])) {
            foreach ($plan['weeks'] as $w) {
                if ((string) ($w['date'] ?? '') === $date) {
                    $week = $w;
                    break;
                }
            }
        }
        Response::success(['plan_meta' => [
            'subject' => $plan['subject'] ?? null,
            'control' => $plan['control'] ?? null,
            'semester' => $plan['semester'] ?? null,
        ], 'lesson' => $week, 'weeks' => $plan['weeks'] ?? []], $q->requestId);
    });
};
