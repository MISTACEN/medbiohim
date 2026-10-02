<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\GeoRegion;

/**
 * Online presence (file-backed, no extra Supabase table).
 * Heartbeat updates last_seen + country from GeoRegion.
 */
final class PresenceService
{
    private const TTL_SEC = 180; // 3 minutes = online

    private function path(): string
    {
        $dir = dirname(__DIR__, 2) . '/data';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir . '/presence_online.json';
    }

    /** @return array<string,array<string,mixed>> */
    private function readAll(): array
    {
        $path = $this->path();
        if (!is_file($path)) return [];
        $raw = json_decode((string) @file_get_contents($path), true);
        return is_array($raw) ? $raw : [];
    }

    /** @param array<string,array<string,mixed>> $data */
    private function writeAll(array $data): void
    {
        $path = $this->path();
        $tmp = $path . '.tmp';
        @file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
        @rename($tmp, $path);
    }

    /**
     * @param array<string,mixed> $user fields: id, email?, name?, role?
     * @return array<string,mixed>
     */
    public function heartbeat(array $user, ?array $server = null): array
    {
        $id = (string) ($user['id'] ?? '');
        if ($id === '') {
            throw new \InvalidArgumentException('user id required');
        }
        $geo = GeoRegion::detect($server ?? $_SERVER);
        $now = time();
        $all = $this->readAll();
        $all[$id] = [
            'user_id' => $id,
            'email' => $user['email'] ?? null,
            'name' => $user['name'] ?? $user['full_name'] ?? null,
            'role' => $user['role'] ?? null,
            'region' => $geo['region'],
            'country' => $geo['country'],
            'geo_source' => $geo['source'],
            'last_seen' => $now,
            'last_seen_iso' => gmdate('c', $now),
        ];
        // prune stale (> 24h)
        foreach ($all as $uid => $row) {
            if (!is_array($row)) { unset($all[$uid]); continue; }
            if (($now - (int) ($row['last_seen'] ?? 0)) > 86400) unset($all[$uid]);
        }
        $this->writeAll($all);
        return $all[$id];
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function listOnline(int $withinSec = self::TTL_SEC): array
    {
        $now = time();
        $out = [];
        foreach ($this->readAll() as $row) {
            if (!is_array($row)) continue;
            $seen = (int) ($row['last_seen'] ?? 0);
            if ($seen <= 0 || ($now - $seen) > $withinSec) continue;
            $row['seconds_ago'] = max(0, $now - $seen);
            $row['online'] = true;
            $out[] = $row;
        }
        usort($out, static fn ($a, $b) => ((int) ($b['last_seen'] ?? 0)) <=> ((int) ($a['last_seen'] ?? 0)));
        return $out;
    }
}
