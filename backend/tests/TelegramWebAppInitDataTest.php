<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Support/TelegramWebAppInitData.php';

use Medbiohim\\Support\\TelegramWebAppInitData;

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
assert($result['ok'] === true);
assert(($result['user']['id'] ?? null) === 123456789);

assert(TelegramWebAppInitData::validate($valid, null, $now)['error'] === 'bot_not_configured');
assert(TelegramWebAppInitData::validate($valid, $token, $now, 10)['error'] === 'init_data_expired');
assert(TelegramWebAppInitData::validate(makeInitData($token, $now + 120), $token, $now)['error'] === 'auth_date_in_future');

$tampered = str_replace('Student', 'Attacker', $valid);
assert(TelegramWebAppInitData::validate($tampered, $token, $now)['ok'] === false);

$duplicate = $valid . '&auth_date=' . $now;
assert(TelegramWebAppInitData::validate($duplicate, $token, $now)['ok'] === false);

echo "Telegram Web App initData tests passed\n";
