<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\TutorService;
use Medbiohim\Support\RateLimiter;

return static function (Router $router): void {
    $router->get('/api/v1/tutor/meta', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        try {
            Response::success((new TutorService())->meta(), $req->requestId);
        } catch (\Throwable $e) {
            Response::error('TUTOR_ERROR', $e->getMessage(), $req->requestId, 500);
        }
    });

    $router->get('/api/v1/tutor/subjects', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        try {
            $meta = (new TutorService())->meta();
            Response::success(['items' => $meta['subjects'] ?? []], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('TUTOR_ERROR', $e->getMessage(), $req->requestId, 500);
        }
    });

    $router->post('/api/v1/tutor/ask', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) {
            return;
        }
        $uid = 'anon';
        if ($req->user !== null) {
            $uid = (string) ($req->user->id ?? 'anon');
        }
        $rl = RateLimiter::attempt('tutor:' . $uid, 30, 300);
        if (!($rl['allowed'] ?? true)) {
            Response::error('RATE_LIMIT', 'Слишком много запросов к тьютору. Подождите несколько минут.', $req->requestId, 429);
            return;
        }

        $question = trim((string) ($req->json('question') ?? $req->json('q') ?? ''));
        $subjectSlug = $req->json('subject_slug');
        $subjectSlug = is_string($subjectSlug) && $subjectSlug !== '' ? $subjectSlug : null;
        $topK = (int) ($req->json('top_k') ?? 6);
        $history = $req->json('history') ?? [];
        if (!is_array($history)) {
            $history = [];
        }
        $cleanHistory = [];
        foreach (array_slice($history, -8) as $h) {
            if (!is_array($h)) {
                continue;
            }
            $role = (string) ($h['role'] ?? 'user');
            $content = trim((string) ($h['content'] ?? ''));
            if ($content === '') {
                continue;
            }
            $cleanHistory[] = [
                'role' => $role === 'assistant' ? 'assistant' : 'user',
                'content' => \Medbiohim\Support\Str::sub($content, 0, 1500),
            ];
        }

        try {
            $out = (new TutorService())->ask($question, $subjectSlug, $cleanHistory, $topK);
            Response::success($out, $req->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION_ERROR', $e->getMessage(), $req->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('TUTOR_ERROR', $e->getMessage(), $req->requestId, 500);
        }
    });
};
