<?php
declare(strict_types=1);

namespace Medbiohim\Health;

use Medbiohim\Support\Env;

final class HealthChecker
{
    private const REQUIRED_EXTENSIONS = [
        'curl', 'json', 'mbstring', 'openssl', 'fileinfo', 'pdo', 'pdo_pgsql',
    ];

    public function check(): array
    {
        $checks = [
            'php' => $this->checkPhp(),
            'extensions' => $this->checkExtensions(),
            'config' => $this->checkConfig(),
            'database' => $this->checkDatabase(),
            'b2' => $this->checkB2Config(),
            'supabase_auth' => $this->checkSupabaseAuthConfig(),
        ];

        $statuses = array_column($checks, 'status');
        $overall = 'healthy';
        if (in_array('fail', $statuses, true)) {
            $overall = 'unhealthy';
        } elseif (in_array('warn', $statuses, true)) {
            $overall = 'degraded';
        }

        return [
            'status' => $overall,
            'service' => 'medbiohim-api',
            'version' => '0.5.0-phase-d',
            'phase' => 'D',
            'php' => PHP_VERSION,
            'time' => date('c'),
            'checks' => $checks,
        ];
    }

    private function checkPhp(): array
    {
        $ok = version_compare(PHP_VERSION, '8.2.0', '>=');
        return [
            'status' => $ok ? 'ok' : 'fail',
            'message' => $ok ? 'PHP ' . PHP_VERSION : 'PHP 8.2+ required, got ' . PHP_VERSION,
        ];
    }

    private function checkExtensions(): array
    {
        $loaded = [];
        $missing = [];
        foreach (self::REQUIRED_EXTENSIONS as $ext) {
            if (extension_loaded($ext)) {
                $loaded[] = $ext;
            } else {
                $missing[] = $ext;
            }
        }
        $strict = Env::get('APP_ENV') === 'production';
        $status = 'ok';
        if ($missing !== []) {
            $status = $strict ? 'fail' : 'warn';
        }
        return ['status' => $status, 'loaded' => $loaded, 'missing' => $missing];
    }

    private function checkConfig(): array
    {
        $keys = [
            'APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY',
            'B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET', 'B2_ENDPOINT', 'CORS_ORIGINS',
        ];
        $present = [];
        $missing = [];
        foreach ($keys as $key) {
            $v = Env::get($key);
            if ($v !== null && $v !== '') {
                $present[] = $key;
            } else {
                $missing[] = $key;
            }
        }
        $status = 'ok';
        if (in_array('SUPABASE_URL', $missing, true)) {
            $status = 'warn';
        }
        return ['status' => $status, 'present' => $present, 'missing' => $missing];
    }

    private function checkDatabase(): array
    {
        $host = Env::get('DB_HOST');
        $name = Env::get('DB_NAME');
        $user = Env::get('DB_USER');
        $pass = Env::get('DB_PASSWORD');
        $port = Env::get('DB_PORT', '5432');
        if (!$host || !$name || !$user) {
            return ['status' => 'warn', 'message' => 'Database not configured (optional until Phase C)'];
        }
        if (!extension_loaded('pdo_pgsql')) {
            return ['status' => 'fail', 'message' => 'pdo_pgsql not loaded'];
        }
        $sslmode = Env::get('DB_SSLMODE', 'require');
        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $host, $port, $name);
        if ($sslmode !== '') {
            $dsn .= ';sslmode=' . $sslmode;
        }
        try {
            $pdo = new \PDO($dsn, $user, $pass ?? '', [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_TIMEOUT => max(3, (int) (Env::get('DB_CONNECT_TIMEOUT', '8') ?: 8)),
            ]);
            $pdo->query('SELECT 1');
            return ['status' => 'ok', 'message' => 'Connected'];
        } catch (\Throwable $e) {
            return ['status' => 'fail', 'message' => 'Connection failed (details hidden)'];
        }
    }

    private function checkB2Config(): array
    {
        $configured = Env::get('B2_KEY_ID') && Env::get('B2_APPLICATION_KEY')
            && Env::get('B2_BUCKET') && Env::get('B2_ENDPOINT');
        return [
            'status' => $configured ? 'ok' : 'warn',
            'configured' => (bool) $configured,
            'message' => $configured ? 'B2 credentials present' : 'B2 not configured (Phase D)',
        ];
    }

    private function checkSupabaseAuthConfig(): array
    {
        $url = Env::get('SUPABASE_URL');
        $anon = Env::get('SUPABASE_ANON_KEY');
        $service = Env::get('SUPABASE_SERVICE_KEY');
        if (!$url) {
            return ['status' => 'warn', 'message' => 'SUPABASE_URL missing (Phase B needs it)'];
        }
        if (!$anon && !$service) {
            return ['status' => 'warn', 'message' => 'Need SUPABASE_ANON_KEY and/or SERVICE_KEY'];
        }
        return [
            'status' => 'ok',
            'message' => 'Supabase Auth config present',
            'has_anon' => (bool) $anon,
            'has_service' => (bool) $service,
        ];
    }
}
// synced 2026-09-15
