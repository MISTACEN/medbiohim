<?php
declare(strict_types=1);

namespace Medbiohim\Health;

use Medbiohim\Database\Connection;
use Medbiohim\Support\Env;

final class HealthChecker
{
    private const REQUIRED_EXTENSIONS = ['curl', 'json', 'mbstring', 'openssl', 'fileinfo', 'pdo', 'pdo_pgsql'];

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
        $overall = in_array('fail', $statuses, true)
            ? 'unhealthy'
            : (in_array('warn', $statuses, true) ? 'degraded' : 'healthy');

        return [
            'status' => $overall,
            'service' => 'medbiohim-api',
            'version' => '0.5.1-phase-all',
            'phase' => 'ALL',
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
            'APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY',
            'DB_URL', 'B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET', 'B2_ENDPOINT', 'CORS_ORIGINS',
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
        return ['status' => 'ok', 'present' => $present, 'missing' => $missing];
    }

    private function checkDatabase(): array
    {
        try {
            $cfg = Connection::config();
        } catch (\Throwable $e) {
            return ['status' => 'fail', 'message' => $e->getMessage()];
        }

        if ($cfg['host'] === '' || $cfg['user'] === '') {
            return ['status' => 'warn', 'message' => 'Database not configured (DB_URL or DB_HOST/DB_USER)'];
        }
        if (!extension_loaded('pdo_pgsql')) {
            return ['status' => 'fail', 'message' => 'pdo_pgsql not loaded'];
        }

        try {
            Connection::reset();
            Connection::pdo()->query('SELECT 1');
            return [
                'status' => 'ok',
                'message' => 'Connected',
                'host' => $cfg['host'],
                'port' => $cfg['port'],
                'user' => $cfg['user'],
            ];
        } catch (\Throwable $e) {
            $raw = Connection::lastError() ?: $e->getMessage();
            $message = strtolower($raw);
            $hint = 'Connection failed';
            if (str_contains($message, 'password authentication failed')) {
                $hint = 'Database authentication failed — check DB password in DB_URL';
            } elseif (str_contains($message, 'could not translate host') || str_contains($message, 'getaddrinfo')) {
                $hint = 'DNS/host resolution failed';
            } elseif (str_contains($message, 'timed out') || str_contains($message, 'timeout')) {
                $hint = 'Connection timed out — SpaceWeb may block outbound 5432/6543';
            } elseif (str_contains($message, 'no pg_hba') || str_contains($message, 'ssl')) {
                $hint = 'SSL/network policy rejected the connection';
            } elseif (str_contains($message, 'tenant') || str_contains($message, 'user')) {
                $hint = 'Pooler user must be postgres.<project_ref>';
            }
            $safe = preg_replace('/:[^:@\/\s]{4,}@/', ':***@', $raw) ?? $raw;
            return [
                'status' => 'fail',
                'message' => $hint,
                'detail' => substr($safe, 0, 300),
                'host' => $cfg['host'],
                'port' => $cfg['port'],
                'user' => $cfg['user'],
            ];
        }
    }

    private function checkB2Config(): array
    {
        $configured = Env::get('B2_KEY_ID') && Env::get('B2_APPLICATION_KEY')
            && Env::get('B2_BUCKET') && Env::get('B2_ENDPOINT');
        return [
            'status' => $configured ? 'ok' : 'warn',
            'configured' => (bool) $configured,
            'message' => $configured ? 'B2 credentials present' : 'B2 not configured',
        ];
    }

    private function checkSupabaseAuthConfig(): array
    {
        $url = Env::get('SUPABASE_URL');
        $anon = Env::get('SUPABASE_ANON_KEY');
        $service = Env::get('SUPABASE_SERVICE_KEY');
        if (!$url) {
            return ['status' => 'fail', 'message' => 'SUPABASE_URL missing'];
        }
        $serviceOk = is_string($service) && str_starts_with($service, 'eyJ');
        if (!$anon || !$service) {
            return ['status' => 'fail', 'message' => 'Supabase Auth keys missing'];
        }
        return [
            'status' => $serviceOk ? 'ok' : 'warn',
            'message' => $serviceOk
                ? 'Supabase Auth config present'
                : 'SUPABASE_SERVICE_KEY does not look like a JWT (need real service_role key)',
            'has_anon' => true,
            'has_service' => (bool) $service,
            'service_looks_valid' => $serviceOk,
        ];
    }
}
