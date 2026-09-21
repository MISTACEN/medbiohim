<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\AccountSettingsService;
use Medbiohim\Support\RateLimiter;

return static function (Router $r): void {
    $r->get('/api/v1/settings/account', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $token = $q->bearerToken() ?? '';
        if ($token === '') {
            Response::error('UNAUTHORIZED', 'Нужен токен', $q->requestId, 401);
            return;
        }
        try {
            $data = (new AccountSettingsService())->getAccount($token);
            Response::success($data, $q->requestId);
        } catch (\Throwable $e) {
            Response::error('SETTINGS_ERROR', $e->getMessage(), $q->requestId, 502);
        }
    });

    $r->patch('/api/v1/settings/profile', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $token = $q->bearerToken() ?? '';
        $body = is_array($q->jsonBody) ? $q->jsonBody : [];
        try {
            $data = (new AccountSettingsService())->updateProfile($token, $body);
            Response::success($data, $q->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION', $e->getMessage(), $q->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('PROFILE_UPDATE_FAILED', $e->getMessage(), $q->requestId, 400);
        }
    });

    $r->post('/api/v1/settings/password', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $rl = RateLimiter::attempt('pwd:' . RateLimiter::clientIp(), 5, 900);
        if (empty($rl['allowed'])) {
            Response::error('RATE_LIMIT', 'Слишком много попыток', $q->requestId, 429);
            return;
        }
        $token = $q->bearerToken() ?? '';
        $pwd = (string) ($q->json('password') ?? $q->json('new_password') ?? '');
        try {
            (new AccountSettingsService())->changePassword($token, $pwd);
            Response::success(['changed' => true], $q->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION', $e->getMessage(), $q->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('PASSWORD_CHANGE_FAILED', $e->getMessage(), $q->requestId, 400);
        }
    });

    $r->post('/api/v1/settings/identities/link', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $token = $q->bearerToken() ?? '';
        $provider = trim((string) ($q->json('provider') ?? ''));
        $redirect = trim((string) ($q->json('redirect_to') ?? ''));
        if ($redirect === '') {
            $redirect = 'https://medbiohim.vercel.app/settings?linked=1';
        }
        try {
            $out = (new AccountSettingsService())->startLinkProvider($token, $provider, $redirect);
            Response::success($out, $q->requestId);
        } catch (\InvalidArgumentException $e) {
            Response::error('VALIDATION', $e->getMessage(), $q->requestId, 422);
        } catch (\Throwable $e) {
            Response::error('LINK_START_FAILED', $e->getMessage(), $q->requestId, 400);
        }
    });

    $r->post('/api/v1/settings/identities/unlink', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $token = $q->bearerToken() ?? '';
        $id = trim((string) ($q->json('identity_id') ?? ''));
        try {
            $data = (new AccountSettingsService())->unlinkIdentity($token, $id);
            Response::success($data, $q->requestId);
        } catch (\Throwable $e) {
            Response::error('UNLINK_FAILED', $e->getMessage(), $q->requestId, 400);
        }
    });

    $r->put('/api/v1/settings/preferences', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $uid = $q->user?->id !== null ? (string) $q->user->id : '';
        $body = is_array($q->jsonBody) ? $q->jsonBody : [];
        $prefs = (new AccountSettingsService())->savePreferences($uid, $body);
        Response::success(['preferences' => $prefs], $q->requestId);
    });
};
