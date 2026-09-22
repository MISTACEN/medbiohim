<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

/** Unified account: profile, password, linked identities (Google/VK/email), preferences. */
final class AccountSettingsService
{
    private string $baseUrl;
    private string $anonKey;
    private string $serviceKey;

    public function __construct()
    {
        $this->baseUrl = rtrim(Env::get('SUPABASE_URL', '') ?? '', '/');
        $this->anonKey = Env::get('SUPABASE_ANON_KEY', '') ?? '';
        $this->serviceKey = Env::get('SUPABASE_SERVICE_KEY', '') ?? '';
    }

    private function apiKey(): string
    {
        return $this->anonKey !== '' ? $this->anonKey : $this->serviceKey;
    }

    public function getAccount(string $accessToken): array
    {
        $user = $this->fetchUser($accessToken);
        if ($user === null) {
            throw new \RuntimeException('Не удалось загрузить профиль');
        }
        $identities = is_array($user['identities'] ?? null) ? $user['identities'] : [];
        $linked = [];
        foreach ($identities as $id) {
            if (!is_array($id)) continue;
            $provider = (string) ($id['provider'] ?? 'unknown');
            $linked[] = [
                'id' => (string) ($id['identity_id'] ?? $id['id'] ?? ''),
                'provider' => $provider,
                'provider_label' => $this->providerLabel($provider),
                'email' => $id['identity_data']['email'] ?? ($id['email'] ?? null),
                'name' => $id['identity_data']['full_name'] ?? $id['identity_data']['name'] ?? $id['identity_data']['preferred_username'] ?? null,
                'last_sign_in_at' => $id['last_sign_in_at'] ?? null,
                'created_at' => $id['created_at'] ?? null,
                'can_unlink' => count($identities) > 1,
            ];
        }
        $prefs = $this->loadPrefs((string) ($user['id'] ?? ''));
        $meta = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];
        return [
            'user' => [
                'id' => $user['id'] ?? null,
                'email' => $user['email'] ?? null,
                'email_confirmed_at' => $user['email_confirmed_at'] ?? null,
                'phone' => $user['phone'] ?? null,
                'full_name' => $meta['full_name'] ?? $meta['name'] ?? null,
                'avatar_url' => $meta['avatar_url'] ?? null,
                'created_at' => $user['created_at'] ?? null,
                'last_sign_in_at' => $user['last_sign_in_at'] ?? null,
            ],
            'identities' => $linked,
            'providers_available' => $this->availableProviders(),
            'preferences' => $prefs,
            'sync' => [
                'account_id' => $user['id'] ?? null,
                'note' => 'Все данные (прогресс, SRS, избранное, сессии) привязаны к этому ID. Привязка Google/VK/Telegram/почты не создаёт второй аккаунт.',
                'scopes' => ['progress', 'srs_cards', 'favorites', 'notes', 'sessions', 'homework'],
            ],
        ];
    }

    public function updateProfile(string $accessToken, array $patch): array
    {
        $body = [];
        if (isset($patch['full_name'])) {
            $body['data'] = ['full_name' => trim((string) $patch['full_name'])];
        }
        if (isset($patch['avatar_url'])) {
            $body['data'] = array_merge($body['data'] ?? [], ['avatar_url' => trim((string) $patch['avatar_url'])]);
        }
        if (isset($patch['email']) && trim((string) $patch['email']) !== '') {
            $body['email'] = trim((string) $patch['email']);
        }
        if ($body === []) throw new \InvalidArgumentException('Нет полей для обновления');
        $res = $this->userRequest('PUT', $accessToken, $body);
        if (($res['status'] ?? 0) >= 400) {
            $msg = $res['json']['msg'] ?? $res['json']['error_description'] ?? $res['json']['error'] ?? 'Ошибка обновления профиля';
            throw new \RuntimeException(is_string($msg) ? $msg : 'Ошибка обновления профиля');
        }
        return $this->getAccount($accessToken);
    }

    public function changePassword(string $accessToken, string $newPassword): void
    {
        if (strlen($newPassword) < 8) throw new \InvalidArgumentException('Пароль не короче 8 символов');
        $res = $this->userRequest('PUT', $accessToken, ['password' => $newPassword]);
        if (($res['status'] ?? 0) >= 400) {
            $msg = $res['json']['msg'] ?? $res['json']['error_description'] ?? 'Не удалось сменить пароль';
            throw new \RuntimeException(is_string($msg) ? $msg : 'Не удалось сменить пароль');
        }
    }

    /** @return array{url:string,provider:string,mode?:string} */
    public function startLinkProvider(string $accessToken, string $provider, string $redirectTo): array
    {
        $provider = strtolower(trim($provider));
        $allowed = ['google', 'custom:vk', 'custom:telegram', 'github', 'discord', 'yandex'];
        if (!in_array($provider, $allowed, true)) {
            throw new \InvalidArgumentException('Провайдер не поддерживается: ' . $provider);
        }
        $url = $this->baseUrl . '/auth/v1/user/identities/authorize';
        $res = HttpClient::request('POST', $url, [
            'provider' => $provider,
            'redirect_to' => $redirectTo,
            'skip_http_redirect' => true,
        ], [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json',
        ], 30);
        $json = $res['json'] ?? null;
        $link = is_array($json) ? ($json['url'] ?? $json['authorize_url'] ?? null) : null;
        if (!is_string($link) || $link === '') {
            if (is_array($json) && ($res['status'] ?? 0) >= 400) {
                $msg = $json['msg'] ?? $json['error_description'] ?? $json['error'] ?? 'Не удалось начать привязку';
                throw new \RuntimeException(is_string($msg) ? $msg : 'Не удалось начать привязку');
            }
            $fallback = $this->baseUrl . '/auth/v1/authorize?provider=' . rawurlencode($provider)
                . '&redirect_to=' . rawurlencode($redirectTo);
            return ['url' => $fallback, 'provider' => $provider, 'mode' => 'authorize_fallback'];
        }
        return ['url' => $link, 'provider' => $provider, 'mode' => 'link'];
    }

    public function unlinkIdentity(string $accessToken, string $identityId): array
    {
        $identityId = trim($identityId);
        if ($identityId === '') throw new \InvalidArgumentException('identity_id required');
        $account = $this->getAccount($accessToken);
        if (count($account['identities']) <= 1) {
            throw new \RuntimeException('Нельзя отвязать единственный способ входа');
        }
        $url = $this->baseUrl . '/auth/v1/user/identities/' . rawurlencode($identityId);
        $res = HttpClient::request('DELETE', $url, null, [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $accessToken,
        ], 30);
        if (($res['status'] ?? 0) >= 400) {
            $json = $res['json'] ?? [];
            $msg = is_array($json) ? ($json['msg'] ?? $json['error_description'] ?? $json['error'] ?? null) : null;
            throw new \RuntimeException(is_string($msg) ? $msg : 'Не удалось отвязать');
        }
        return $this->getAccount($accessToken);
    }

    public function savePreferences(string $userId, array $prefs): array
    {
        $current = $this->loadPrefs($userId);
        $allowed = ['theme', 'locale', 'notify_email', 'notify_telegram', 'notify_homework', 'notify_lectures', 'media_prefer_ru'];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $prefs)) $current[$k] = $prefs[$k];
        }
        $current['updated_at'] = gmdate('c');
        $this->writePrefs($userId, $current);
        return $current;
    }

    private function loadPrefs(string $userId): array
    {
        $defaults = [
            'theme' => 'system', 'locale' => 'ru', 'notify_email' => true, 'notify_telegram' => false,
            'notify_homework' => true, 'notify_lectures' => true, 'media_prefer_ru' => true, 'updated_at' => null,
        ];
        if ($userId === '') return $defaults;
        $path = $this->prefsPath($userId);
        if (!is_file($path)) return $defaults;
        $raw = @file_get_contents($path);
        $j = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($j) ? array_merge($defaults, $j) : $defaults;
    }

    private function writePrefs(string $userId, array $prefs): void
    {
        $dir = dirname($this->prefsPath($userId));
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        file_put_contents($this->prefsPath($userId), json_encode($prefs, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }

    private function prefsPath(string $userId): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
        return dirname(__DIR__, 2) . '/data/user_settings/' . $safe . '.json';
    }

    private function fetchUser(string $accessToken): ?array
    {
        if ($this->baseUrl === '' || $accessToken === '') return null;
        $res = HttpClient::request('GET', $this->baseUrl . '/auth/v1/user', null, [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $accessToken,
        ], 20);
        return (($res['status'] ?? 0) === 200 && is_array($res['json'] ?? null)) ? $res['json'] : null;
    }

    private function userRequest(string $method, string $accessToken, ?array $body): array
    {
        return HttpClient::request($method, $this->baseUrl . '/auth/v1/user', $body, [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json',
        ], 30);
    }

    private function providerLabel(string $p): string
    {
        return match ($p) {
            'email' => 'Почта / пароль', 'google' => 'Google', 'vk' => 'ВКонтакте', 'custom:vk' => 'ВКонтакте', 'custom:telegram' => 'Telegram',
            'yandex' => 'Яндекс', 'github' => 'GitHub', 'discord' => 'Discord', 'phone' => 'Телефон', default => $p,
        };
    }

    private function availableProviders(): array
    {
        return [
            ['id' => 'email', 'label' => 'Почта / пароль', 'region' => 'any', 'enabled' => true, 'linkable' => false],
            ['id' => 'google', 'label' => 'Google', 'region' => 'global', 'enabled' => Env::get('OAUTH_GOOGLE_ENABLED', '1') !== '0', 'linkable' => true],
            ['id' => 'custom:vk', 'label' => 'ВКонтакте', 'region' => 'ru', 'enabled' => Env::get('OAUTH_VK_ENABLED', '1') !== '0', 'linkable' => true],
            ['id' => 'custom:telegram', 'label' => 'Telegram', 'region' => 'any', 'enabled' => Env::get('OAUTH_TELEGRAM_ENABLED', '1') !== '0', 'linkable' => true],
            ['id' => 'yandex', 'label' => 'Яндекс', 'region' => 'ru', 'enabled' => Env::get('OAUTH_YANDEX_ENABLED', '0') === '1', 'linkable' => true],
        ];
    }
}
