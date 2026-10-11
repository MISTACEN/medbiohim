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
            \Medbiohim\Support\Logger::error('settings_account_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('SETTINGS_ERROR', 'Настройки временно недоступны', $q->requestId, 503);
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
            \Medbiohim\Support\Logger::error('profile_update_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('PROFILE_UPDATE_FAILED', 'Не удалось обновить профиль', $q->requestId, 502);
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
            \Medbiohim\Support\Logger::error('password_change_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('PASSWORD_CHANGE_FAILED', 'Не удалось изменить пароль', $q->requestId, 502);
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
            \Medbiohim\Support\Logger::error('identity_link_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('LINK_START_FAILED', 'Не удалось начать привязку аккаунта', $q->requestId, 502);
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
            \Medbiohim\Support\Logger::error('identity_unlink_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('UNLINK_FAILED', 'Не удалось отвязать аккаунт', $q->requestId, 502);
        }
    });

    $r->put('/api/v1/settings/preferences', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $uid = $q->user?->id !== null ? (string) $q->user->id : '';
        $body = is_array($q->jsonBody) ? $q->jsonBody : [];
        $prefs = (new AccountSettingsService())->savePreferences($uid, $body);
        Response::success(['preferences' => $prefs], $q->requestId);
    });

    $r->post('/api/v1/settings/telegram/link-start', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        $uid = (string) ($q->user?->id ?? '');
        if ($uid === '') { Response::error('UNAUTHORIZED', 'Нужна авторизация', $q->requestId, 401); return; }
        $limit = RateLimiter::attempt('telegram-link:' . $uid, 5, 900);
        if (empty($limit['allowed'])) {
            Response::error('RATE_LIMITED', 'Слишком много попыток привязки. Попробуйте позже.', $q->requestId, 429, ['retry_after' => $limit['retry_after'] ?? 900]);
            return;
        }
        try {
            $db = \\Medbiohim\\Database\\Connection::pdo();
            $token = bin2hex(random_bytes(24));
            $stmt = $db->prepare("INSERT INTO public.telegram_account_link_tokens (user_id, token_hash, expires_at) VALUES (:uid, :hash, now() + interval '10 minutes')");
            $stmt->execute(['uid' => $uid, 'hash' => hash('sha256', $token)]);
            $bot = ltrim(trim((string) (\\Medbiohim\\Support\\Env::get('TELEGRAM_BOT_USERNAME', 'MEDBIOCHIM_bot') ?? 'MEDBIOCHIM_bot')), '@');
            Response::success(['url' => 'https://t.me/' . rawurlencode($bot) . '?start=link_' . $token, 'expires_in_seconds' => 600], $q->requestId);
        } catch (\\Throwable $e) {
            \\Medbiohim\\Support\\Logger::error('telegram_link_start_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('TELEGRAM_LINK_UNAVAILABLE', 'Не удалось начать привязку Telegram', $q->requestId, 503);
        }
    });

    $r->get('/api/v1/settings/telegram/status', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $stmt = \\Medbiohim\\Database\\Connection::pdo()->prepare('SELECT username, first_name, linked_at FROM public.telegram_accounts WHERE user_id = :uid LIMIT 1');
            $stmt->execute(['uid' => (string) ($q->user?->id ?? '')]);
            $row = $stmt->fetch(\\PDO::FETCH_ASSOC);
            Response::success(['linked' => is_array($row), 'account' => is_array($row) ? $row : null], $q->requestId);
        } catch (\\Throwable $e) {
            \\Medbiohim\\Support\\Logger::error('telegram_link_status_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('TELEGRAM_LINK_UNAVAILABLE', 'Статус Telegram временно недоступен', $q->requestId, 503);
        }
    });

    $r->post('/api/v1/settings/telegram/unlink', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) return;
        try {
            $stmt = \\Medbiohim\\Database\\Connection::pdo()->prepare('DELETE FROM public.telegram_accounts WHERE user_id = :uid');
            $stmt->execute(['uid' => (string) ($q->user?->id ?? '')]);
            Response::success(['unlinked' => $stmt->rowCount() > 0], $q->requestId);
        } catch (\\Throwable $e) {
            \\Medbiohim\\Support\\Logger::error('telegram_unlink_failed', ['requestId' => $q->requestId, 'error' => $e->getMessage()]);
            Response::error('TELEGRAM_UNLINK_FAILED', 'Не удалось отвязать Telegram', $q->requestId, 503);
        }
    });

};
