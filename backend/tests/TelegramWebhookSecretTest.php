<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/Support/TelegramWebhookSecret.php';

use Medbiohim\Support\TelegramWebhookSecret;

function assertWebhookSecret(bool $expected, bool $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "[FAIL] {$label}\n");
        exit(1);
    }
    echo "[PASS] {$label}\n";
}

assertWebhookSecret(false, TelegramWebhookSecret::matches('', 'anything'), 'missing configured secret fails closed');
assertWebhookSecret(false, TelegramWebhookSecret::matches(null, 'anything'), 'null configured secret fails closed');
assertWebhookSecret(false, TelegramWebhookSecret::matches('configured', null), 'missing request secret is rejected');
assertWebhookSecret(false, TelegramWebhookSecret::matches('configured', ''), 'empty request secret is rejected');
assertWebhookSecret(false, TelegramWebhookSecret::matches('configured', 'wrong'), 'incorrect request secret is rejected');
assertWebhookSecret(true, TelegramWebhookSecret::matches('configured', 'configured'), 'matching secret is accepted');

echo "Telegram webhook secret tests passed.\n";
