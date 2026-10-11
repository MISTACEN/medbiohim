<?php
declare(strict_types=1);

namespace Medbiohim\\Support;

/**
 * Validates Telegram Mini App initData before any Telegram identity is trusted.
 *
 * This class deliberately does not create accounts or link identities. Callers
 * must still require an explicit, one-time account-linking/registration flow.
 */
final class TelegramWebAppInitData
{
    /**
     * @return array{ok: bool, user?: array<string,mixed>, auth_date?: int, error?: string}
     */
    public static function validate(
        string $initData,
        ?string $botToken,
        int $now,
        int $maxAgeSeconds = 86400,
        int $futureSkewSeconds = 60
    ): array {
        if ($botToken === null || trim($botToken) === '') {
            return ['ok' => false, 'error' => 'bot_not_configured'];
        }
        if ($initData === '' || strlen($initData) > 16384) {
            return ['ok' => false, 'error' => 'invalid_init_data'];
        }

        $fields = [];
        foreach (explode('&', $initData) as $part) {
            if ($part === '') continue;
            $pair = explode('=', $part, 2);
            $key = urldecode($pair[0]);
            $value = urldecode($pair[1] ?? '');
            if ($key === '' || array_key_exists($key, $fields)) {
                return ['ok' => false, 'error' => 'invalid_init_data'];
            }
            $fields[$key] = $value;
        }

        $receivedHash = $fields['hash'] ?? null;
        $authDateRaw = $fields['auth_date'] ?? null;
        if (!is_string($receivedHash) || !preg_match('/^[a-f0-9]{64}$/i', $receivedHash)
            || !is_string($authDateRaw) || !ctype_digit($authDateRaw)) {
            return ['ok' => false, 'error' => 'missing_required_fields'];
        }

        $authDate = (int) $authDateRaw;
        if ($authDate > $now + max(0, $futureSkewSeconds)) {
            return ['ok' => false, 'error' => 'auth_date_in_future'];
        }
        if ($authDate < $now - max(1, $maxAgeSeconds)) {
            return ['ok' => false, 'error' => 'init_data_expired'];
        }

        unset($fields['hash']);
        ksort($fields, SORT_STRING);
        $parts = [];
        foreach ($fields as $key => $value) {
            $parts[] = $key . '=' . $value;
        }
        $dataCheckString = implode("\n", $parts);
        $secretKey = hash_hmac('sha256', $botToken, 'WebAppData', true);
        $expectedHash = hash_hmac('sha256', $dataCheckString, $secretKey);
        if (!hash_equals(strtolower($receivedHash), $expectedHash)) {
            return ['ok' => false, 'error' => 'invalid_hash'];
        }

        $user = null;
        if (isset($fields['user'])) {
            $decoded = json_decode($fields['user'], true);
            if (!is_array($decoded) || !isset($decoded['id']) || !is_numeric($decoded['id'])) {
                return ['ok' => false, 'error' => 'invalid_user'];
            }
            $user = $decoded;
        }

        if ($user === null) {
            return ['ok' => false, 'error' => 'missing_user'];
        }

        return ['ok' => true, 'user' => $user, 'auth_date' => $authDate];
    }
}
