<?php
declare(strict_types=1);

namespace Medbiohim\Support;

/**
 * Backward-compatible facade for the shared Supabase REST helper.
 *
 * Some legacy services reference Medbiohim\Support\SupabaseRest while the
 * implementation lives in Medbiohim\Services\SupabaseRest. Keep both
 * namespaces valid so an individual service cannot take down the API.
 */
final class SupabaseRest
{
    public static function __callStatic(string $name, array $arguments): mixed
    {
        $class = \Medbiohim\Services\SupabaseRest::class;
        return $class::$name(...$arguments);
    }
}
