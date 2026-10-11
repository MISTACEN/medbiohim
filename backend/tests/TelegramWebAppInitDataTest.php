<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Support/TelegramWebAppInitData.php';

use Medbiohim\Support\TelegramWebAppInitData;

function check(bool $condition): void
{
    if (!$condition) throw new RuntimeException('Telegram Web App initData regression test failed');
}

function makeInitData(string $token, int $authDate, array $extra = []): string
{
    $fields = array_merge([
        'auth_date' => (string) $authDate,
        'query_id' => 'AAExampleQueryId',
        'user' => json_encode(['id' => 123456789, 'first_name' => 'Student'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ], $extra);
    ksort($fields, SORT_STRING);
    $parts = [];
    foreach ($fields as $key => $value) $parts[] = $key . '=' . $value;
    $secret = hash_hmac('sha256', $token, 'WebAppData', true);
    $fields['hash'] = hash_hmac('sha256', implode("\n", $parts), $secret);
    $query = [];
    foreach ($fields as $key => $value) $query[] = rawurlencode($key) . '=' . rawurlencode((string) $value);
    return implode('&', $query);
}

$token = '123456:TEST_BOT_TOKEN';
$now = 1800000000;
$valid = makeInitData($token, $now - 30);
$result = TelegramWebAppInitData::validate($valid, $token, $now);
check($result['ok'] === true);
check(($result['user']['id'] ?? null) === 123456789);

check(TelegramWebAppInitData::validate($valid, null, $now)['error'] === 'bot_not_configured');
check(TelegramWebAppInitData::validate($valid, $token, $now, 10)['error'] === 'init_data_expired');
check(TelegramWebAppInitData::validate(makeInitData($token, $now + 120), $token, $now)['error'] === 'auth_date_in_future');

$tampered = str_replace('Student', 'Attacker', $valid);
check(TelegramWebAppInitData::validate($tampered, $token, $now)['ok'] === false);

$duplicate = $valid . '&auth_date=' . $now;
check(TelegramWebAppInitData::validate($duplicate, $token, $now)['ok'] === false);

$withoutUser = makeInitData($token, $now - 30, ['user' => '']);
check(TelegramWebAppInitData::validate($withoutUser, $token, $now)['error'] === 'invalid_user');

$badUserId = makeInitData($token, $now - 30, [
    'user' => json_encode(['id' => 'not-an-id', 'first_name' => 'Student']),
]);
check(TelegramWebAppInitData::validate($badUserId, $token, $now)['ok'] === false);

$fractionalUserId = makeInitData($token, $now - 30, [
    'user' => json_encode(['id' => 12.5, 'first_name' => 'Student']),
]);
check(TelegramWebAppInitData::validate($fractionalUserId, $token, $now)['error'] === 'invalid_user');

$zeroUserId = makeInitData($token, $now - 30, [
    'user' => json_encode(['id' => 0, 'first_name' => 'Student']),
]);
check(TelegramWebAppInitData::validate($zeroUserId, $token, $now)['error'] === 'invalid_user');

$noUser = makeInitData($token, $now - 30, ['user' => null]);
check(TelegramWebAppInitData::validate($noUser, $token, $now)['ok'] === false);

check(TelegramWebAppInitData::validate(str_repeat('a', 16385), $token, $now)['error'] === 'invalid_init_data');
check(TelegramWebAppInitData::validate('', $token, $now)['error'] === 'invalid_init_data');

echo "Telegram Web App initData tests passed\\n";
