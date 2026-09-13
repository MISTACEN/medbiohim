<?php
declare(strict_types=1);

namespace Medbiohim\Health;

use Medbiohim\Support\Env;

final class HealthChecker
{
    private const REQUIRED_EXTENSIONS = [
        'curl', 'json', 'mbstring', 'openssl', 'fileinfo', 'pdo', 'pdo_pgsql',
    ];

    /** @return array{status: string, checks: array, time: string, php: string, service: string, version: string} */
    public function check(): array
    {
        $checks = [
            'php' => $this->checkPhp(),
            'extensions' => $this->checkExtensions(),
            'config' => $this->checkConfig(),
            'database' => $this->checkDatabase(),
            'b2' => $this->checkB2Config(),
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
            'version' => '0.1.0-phase-a',
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
        return [
            'status' => $missing === [] ? 'ok' : 'fail',
            'loaded' => $loaded,
            'missing' => $missing,
        ];
    }

    private function checkConfig(): array
    {
        $keys = [
            'APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY',
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
        if (in_array('SUPABASE_URL', $missing, true) || in_array('SUPABASE_SERVICE_KEY', $missing, true)) {
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
            return ['status' => 'warn', 'message' => 'Database not configured (Phase A optional)'];
        }

        if (!extension_loaded('pdo_pgsql')) {
            return ['status' => 'fail', 'message' => 'pdo_pgsql not loaded'];
        }

        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $host, $port, $name);
        try {
            $pdo = new \PDO($dsn, $user, $pass ?? '', [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_TIMEOUT => 3,
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
}
