<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\GeoRegion;
use Medbiohim\Support\SupabaseRest;

/**
 * Online presence stored in Supabase.
 * A row is considered online when last_seen is within the requested TTL.
 */
final class PresenceService
{
    private const TTL_SEC = 180;

    /** @param array<string,mixed> $user */
    public function heartbeat(array $user, ?array $server = null): array
    {
        $id = trim((string) ($user['id'] ?? ''));
        if ($id === '') {
            throw new \InvalidArgumentException('user id required');
        }

        $geo = GeoRegion::detect($server ?? $_SERVER);
        $row = [
            'user_id' => $id,
            'name' => $user['name'] ?? $user['full_name'] ?? null,
            'role' => $user['role'] ?? null,
            'region' => $geo['region'],
            'country' => $geo['country'],
            'geo_source' => $geo['source'],
            'last_seen' => gmdate('c'),
        ];

        $existing = SupabaseRest::select(
            'presence_online?user_id=eq.' . rawurlencode($id) . '&select=user_id&limit=1'
        );
        if ($existing) {
            $updated = SupabaseRest::patch(
                'presence_online?user_id=eq.' . rawurlencode($id),
                $row,
                true
            );
            return $updated[0] ?? $row;
        }

        $inserted = SupabaseRest::insert('presence_online', $row, true);
        return $inserted[0] ?? $row;
    }

    /** @return list<array<string,mixed>> */
    public function listOnline(int $withinSec = self::TTL_SEC): array
    {
        $withinSec = max(60, min($withinSec, 900));
        $cutoff = gmdate('c', time() - $withinSec);
        $rows = SupabaseRest::select(
            'presence_online?last_seen=gte.' . rawurlencode($cutoff)
            . '&select=user_id,name,role,region,country,geo_source,last_seen'
            . '&order=last_seen.desc&limit=500'
        );

        $out = [];
        $now = time();
        foreach ($rows as $row) {
            $seen = strtotime((string) ($row['last_seen'] ?? '')) ?: 0;
            if ($seen <= 0) continue;
            $row['seconds_ago'] = max(0, $now - $seen);
            $row['online'] = true;
            $out[] = $row;
        }
        return $out;
    }
}
