<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class RateLimiter
{
    public static function attempt(string $key, int $maxAttempts, int $windowSeconds): array
    {
        $dir = dirname(__DIR__, 2) . '/logs/ratelimit';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $file = $dir . '/' . hash('sha256', $key) . '.json';
        $now = time();
        $data = ['start' => $now, 'count' => 0];
        if (is_readable($file)) {
            $raw = file_get_contents($file);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded) && isset($decoded['start'], $decoded['count'])) {
                $data = $decoded;
            }
        }
        if ($now - (int) $data['start'] >= $windowSeconds) {
            $data = ['start' => $now, 'count' => 0];
        }
        $data['count'] = (int) $data['count'] + 1;
        @file_put_contents($file, json_encode($data), LOCK_EX);
        if ($data['count'] > $maxAttempts) {
            return ['allowed' => false, 'retry_after' => max(1, $windowSeconds - ($now - (int) $data['start']))];
        }
        return ['allowed' => true, 'retry_after' => 0];
    }

    public static function clientIp(): string
    {
        return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
}
