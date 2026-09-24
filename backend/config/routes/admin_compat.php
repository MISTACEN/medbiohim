<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\SupabaseRest;
use Medbiohim\Services\B2Storage;

return static function (Router $router): void {
    $adminGate = static function (Request $req): bool {
        if (!RequireAuth::handle($req)) return false;
        return RequireRole::handle($req, ['admin', 'moderator', 'teacher']);
    };

    $router->get('/api/v1/admin/curriculum', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        try {
            Response::success(['items' => SupabaseRest::listSubjects()], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->put('/api/v1/admin/curriculum', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $items = is_array($req->jsonBody['items'] ?? null) ? $req->jsonBody['items'] : [];
        $allowed = ['code','name','short_name','description','course_number','semester','control_type',
            'lecture_hours','practice_hours','self_study_hours','total_hours','credits','specialty_slug',
            'slug','is_active'];
        try {
            foreach ($items as $item) {
                if (!is_array($item)) continue;
                $id = trim((string)($item['id'] ?? ''));
                $data = [];
                foreach ($allowed as $key) {
                    if (array_key_exists($key, $item)) $data[$key] = $item[$key];
                }
                if (($data['name'] ?? '') === '') continue;
                if ($id !== '') {
                    SupabaseRest::patch('subjects?id=eq.' . rawurlencode($id), $data, false);
                } else {
                    SupabaseRest::insert('subjects', $data, false);
                }
            }
            Response::success(['items' => SupabaseRest::listSubjects()], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 422);
        }
    });

    $router->get('/api/v1/admin/tests', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        try {
            $items = SupabaseRest::select(
                'tests?select=id,subject_id,module_id,topic_id,title,time_limit_sec,max_attempts,is_published,created_at,archived_at,source_key&order=created_at.desc'
            );
            foreach ($items as &$test) {
                $links = SupabaseRest::select(
                    'test_questions?test_id=eq.' . rawurlencode((string)$test['id']) . '&select=question_id,order_index&order=order_index.asc'
                );
                $test['questions'] = $links;
                $test['questions_count'] = count($links);
            }
            unset($test);
            Response::success(['items' => $items, 'db_items' => $items], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->put('/api/v1/admin/tests', static function (Request $req, array $params) use ($adminGate): void {
        if (!$adminGate($req)) return;
        $items = is_array($req->jsonBody['items'] ?? null) ? $req->jsonBody['items'] : [];
        $allowed = ['subject_id','module_id','topic_id','title','time_limit_sec','max_attempts','is_published','archived_at','source_key'];
        try {
            foreach ($items as $item) {
                if (!is_array($item) || trim((string)($item['title'] ?? '')) === '') continue;
                $id = trim((string)($item['id'] ?? ''));
                $data = [];
                foreach ($allowed as $key) if (array_key_exists($key, $item)) $data[$key] = $item[$key];
                if ($id !== '') {
                    SupabaseRest::patch('tests?id=eq.' . rawurlencode($id), $data, false);
                } else {
                    SupabaseRest::insert('tests', $data, false);
                }
            }
            $itemsOut = SupabaseRest::select(
                'tests?select=id,subject_id,module_id,topic_id,title,time_limit_sec,max_attempts,is_published,created_at,archived_at,source_key&order=created_at.desc'
            );
            Response::success(['items' => $itemsOut], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_ERROR', $e->getMessage(), $req->requestId, 422);
        }
    });
};
