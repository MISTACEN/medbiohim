<?php
declare(strict_types=1);

namespace Medbiohim\Support;

/** Multibyte-safe string helpers with fallback when ext-mbstring is missing. */
final class Str
{
    public static function lower(string $s): string
    {
        return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
    }

    public static function len(string $s): int
    {
        return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
    }

    public static function sub(string $s, int $start, ?int $length = null): string
    {
        if (function_exists('mb_substr')) {
            return $length === null ? mb_substr($s, $start, null, 'UTF-8') : mb_substr($s, $start, $length, 'UTF-8');
        }
        return $length === null ? substr($s, $start) : substr($s, $start, $length);
    }

    public static function contains(string $haystack, string $needle): bool
    {
        if ($needle === '') {
            return true;
        }
        return function_exists('mb_strpos')
            ? mb_strpos($haystack, $needle) !== false
            : strpos($haystack, $needle) !== false;
    }
}
