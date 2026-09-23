<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\AcademicPlanningService;

return static function (Router $r): void {
    $r->post('/api/v1/academic/sync', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            (new AcademicPlanningService())->sync($q->user->id);
            Response::success(['synced'=>true], $q->requestId);
        } catch (\Throwable $e) {
            Response::error('ACADEMIC_SYNC_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->get('/api/v1/academic/state', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            Response::success((new AcademicPlanningService())->state($q->user->id), $q->requestId);
        } catch (\Throwable $e) {
            Response::error('ACADEMIC_STATE_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->put('/api/v1/academic/state', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $row=(new AcademicPlanningService())->saveState($q->user->id, $q->jsonBody());
            Response::success(['state'=>$row], $q->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $q->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('ACADEMIC_STATE_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });

    $r->post('/api/v1/academic/ai-plan', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            Response::success((new AcademicPlanningService())->generatePlan($q->user->id), $q->requestId);
        } catch (\Throwable $e) {
            Response::error('ACADEMIC_AI_PLAN_ERROR', $e->getMessage(), $q->requestId, 500);
        }
    });
};
