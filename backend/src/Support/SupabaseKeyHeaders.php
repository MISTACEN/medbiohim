<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class SupabaseKeyHeaders
{
    /**
     * Headers for privileged server-side Supabase REST calls.
     *
     * Legacy service_role keys are JWTs and can be sent as Authorization Bearer.
     * Modern sb_secret_ keys are opaque API keys and must stay in the apikey header.
     *
     * @return list<string>
     */
    public static function service(string $key): array
    {
        $key = trim($key);
        if ($key === '') return [];

        $headers = ['apikey: ' . $key];
        if (str_starts_with($key, 'eyJ')) {
            $headers[] = 'Authorization: Bearer ' . $key;
        }
        return $headers;
    }
}
