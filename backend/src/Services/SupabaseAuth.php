<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Auth\AuthUser;
use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
use Medbiohim\Support\Logger;

final class SupabaseAuth
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

    public function isConfigured(): bool
    {
        return $this->baseUrl !== '' && ($this->anonKey !== '' || $this->serviceKey !== '');
    }

    public function login(string $email, string $password): array
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'code' => 'AUTH_NOT_CONFIGURED', 'message' => 'Supabase Auth is not configured on the server', 'status' => 503];
        }
        $url = $this->baseUrl . '/auth/v1/token?grant_type=password';
        $res = HttpClient::request('POST', $url, ['email' => $email, 'password' => $password], [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $this->apiKey(),
        ]);
        if ($res['status'] === 0) {
            return ['ok' => false, 'code' => 'AUTH_UPSTREAM_ERROR', 'message' => 'Could not reach Supabase Auth', 'status' => 502];
        }
        if ($res['status'] >= 400 || $res['json'] === null) {
            $msg = $res['json']['error_description'] ?? $res['json']['msg'] ?? $res['json']['error'] ?? 'Invalid credentials';
            Logger::info('auth_login_failed', ['status' => $res['status']]);
            return ['ok' => false, 'code' => 'AUTH_INVALID_CREDENTIALS', 'message' => is_string($msg) ? $msg : 'Invalid credentials', 'status' => 401];
        }
        return ['ok' => true, 'data' => $this->normalizeSession($res['json'])];
    }

    public function register(string $email, string $password, ?string $fullName = null): array
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'code' => 'AUTH_NOT_CONFIGURED', 'message' => 'Supabase Auth is not configured on the server', 'status' => 503];
        }
        $payload = ['email' => $email, 'password' => $password];
        if ($fullName !== null && trim($fullName) !== '') {
            $name = trim($fullName);
            $payload['data'] = ['full_name' => $name, 'name' => $name];
        }
        $res = HttpClient::request('POST', $this->baseUrl . '/auth/v1/signup', $payload, [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $this->apiKey(),
            'Content-Type: application/json',
        ], 30);
        if ($res['status'] === 0) {
            return ['ok' => false, 'code' => 'AUTH_UPSTREAM_ERROR', 'message' => 'Could not reach Supabase Auth', 'status' => 502];
        }
        if ($res['status'] >= 400 || $res['json'] === null) {
            $msg = $res['json']['msg'] ?? $res['json']['error_description'] ?? $res['json']['error'] ?? 'Registration failed';
            return ['ok' => false, 'code' => 'AUTH_REGISTER_FAILED', 'message' => is_string($msg) ? $msg : 'Registration failed', 'status' => 422];
        }
        $data = $this->normalizeSession($res['json']);
        $data['needs_email_confirm'] = empty($data['access_token']);
        if (empty($data['user']['full_name']) && $fullName) {
            $data['user']['full_name'] = trim($fullName);
        }
        return ['ok' => true, 'data' => $data];
    }

    public function refresh(string $refreshToken): array
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'code' => 'AUTH_NOT_CONFIGURED', 'message' => 'Supabase Auth is not configured on the server', 'status' => 503];
        }
        $url = $this->baseUrl . '/auth/v1/token?grant_type=refresh_token';
        $res = HttpClient::request('POST', $url, ['refresh_token' => $refreshToken], [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $this->apiKey(),
        ]);
        if ($res['status'] === 400 || $res['status'] === 401) {
            return ['ok' => false, 'code' => 'INVALID_REFRESH', 'message' => 'Could not refresh session', 'status' => 401];
        }
        if ($res['status'] === 0 || $res['status'] >= 500 || $res['status'] === 403 || $res['json'] === null) {
            return ['ok' => false, 'code' => 'AUTH_UPSTREAM_ERROR', 'message' => 'Supabase Auth is temporarily unavailable', 'status' => 502];
        }
        if ($res['status'] >= 400) {
            return ['ok' => false, 'code' => 'AUTH_UPSTREAM_ERROR', 'message' => 'Supabase Auth rejected the refresh request', 'status' => 502];
        }
        return ['ok' => true, 'data' => $this->normalizeSession($res['json'])];
    }

    public function logout(string $accessToken): array
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'code' => 'AUTH_NOT_CONFIGURED', 'message' => 'Supabase Auth is not configured on the server', 'status' => 503];
        }
        $url = $this->baseUrl . '/auth/v1/logout';
        $res = HttpClient::request('POST', $url, [], [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $accessToken,
        ]);
        if ($res['status'] === 0) {
            return ['ok' => false, 'code' => 'AUTH_UPSTREAM_ERROR', 'message' => 'Could not reach Supabase Auth', 'status' => 502];
        }
        return ['ok' => true];
    }

    public function recover(string $email): array
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'code' => 'AUTH_NOT_CONFIGURED', 'message' => 'Supabase Auth is not configured on the server', 'status' => 503];
        }
        $redirect = trim((string) \Medbiohim\Support\Env::get('AUTH_RECOVERY_REDIRECT', 'https://medbiohim.vercel.app/auth/callback'));
        $url = $this->baseUrl . '/auth/v1/recover?redirect_to=' . rawurlencode($redirect);
        $res = HttpClient::request('POST', $url, ['email' => $email], [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $this->apiKey(),
        ]);
        if ($res['status'] === 0) {
            return ['ok' => false, 'code' => 'AUTH_UPSTREAM_ERROR', 'message' => 'Could not reach Supabase Auth', 'status' => 502];
        }
        return ['ok' => true];
    }

    public function userFromAccessToken(string $accessToken): ?AuthUser
    {
        if (!$this->isConfigured() || $accessToken === '') return null;
        $url = $this->baseUrl . '/auth/v1/user';
        $res = HttpClient::request('GET', $url, null, [
            'apikey: ' . $this->apiKey(),
            'Authorization: Bearer ' . $accessToken,
        ]);
        if ($res['status'] !== 200 || $res['json'] === null) return null;
        $j = $res['json'];
        $id = (string) ($j['id'] ?? '');
        $email = (string) ($j['email'] ?? '');
        if ($id === '') return null;
        // user_metadata is editable by the user and must never grant backend roles.
        $role = self::trustedRoleFromUserPayload($j);
        return new AuthUser($id, $email, $role, $j);
    }

    /**
     * Only app_metadata is server-controlled in Supabase. Never trust user_metadata
     * or the top-level user.role field for authorization.
     */
    public static function trustedRoleFromUserPayload(array $user): ?string
    {
        $appMetadata = is_array($user['app_metadata'] ?? null) ? $user['app_metadata'] : [];
        $role = $appMetadata['role'] ?? null;
        return is_string($role) && trim($role) !== '' ? trim($role) : null;
    }

    private function apiKey(): string
    {
        return $this->anonKey !== '' ? $this->anonKey : $this->serviceKey;
    }

    private function normalizeSession(array $json): array
    {
        $user = $json['user'] ?? [];
        $meta = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];
        return [
            'access_token' => $json['access_token'] ?? null,
            'refresh_token' => $json['refresh_token'] ?? null,
            'expires_in' => $json['expires_in'] ?? null,
            'token_type' => $json['token_type'] ?? 'bearer',
            'user' => [
                'id' => $user['id'] ?? null,
                'email' => $user['email'] ?? null,
                'full_name' => $meta['full_name'] ?? ($meta['name'] ?? null),
                'role' => self::trustedRoleFromUserPayload($user),
            ],
        ];
    }
}
