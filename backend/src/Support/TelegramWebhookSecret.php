<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class TelegramWebhookSecret
{
    public static function matches(?string $expected, ?string $provided): bool
    {
        if ($expected === null || $expected === '' || $provided === null || $provided === '') {
            return false;
        }

        return hash_equals($expected, $provided);
    }
}
