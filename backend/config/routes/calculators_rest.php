<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\CalculatorsService;

return static function (Router $router): void {
    $router->get('/api/v1/calculators', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $svc = new CalculatorsService();
        $items = $svc->catalog();
        $categories = [];
        foreach ($items as $c) {
            $cat = (string) ($c['category'] ?? 'прочее');
            $categories[$cat] = $categories[$cat] ?? [];
            $categories[$cat][] = [
                'id' => $c['id'],
                'name' => $c['name'],
                'category' => $cat,
                'description' => $c['description'] ?? '',
            ];
        }
        Response::success([
            'items' => $items,
            'categories' => $categories,
            'count' => count($items),
        ], $req->requestId);
    });

    $router->get('/api/v1/calculators/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $id = (string) ($params['id'] ?? '');
        $c = (new CalculatorsService())->get($id);
        if ($c === null) {
            Response::error('NOT_FOUND', 'Калькулятор не найден', $req->requestId, 404);
            return;
        }
        Response::success(['calculator' => $c], $req->requestId);
    });

    $router->post('/api/v1/calculators/{id}/compute', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $id = (string) ($params['id'] ?? '');
        $svc = new CalculatorsService();
        if ($svc->get($id) === null) {
            Response::error('NOT_FOUND', 'Калькулятор не найден', $req->requestId, 404);
            return;
        }
        $input = $req->jsonBody ?? [];
        if (!is_array($input)) {
            $input = [];
        }
        if (isset($input['input']) && is_array($input['input'])) {
            $input = $input['input'];
        }
        try {
            $result = $svc->compute($id, $input);
            Response::success($result, $req->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('CALC_ERROR', $e->getMessage(), $req->requestId, 500);
        }
    });
};
