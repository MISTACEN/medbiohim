<?php
declare(strict_types=1);

namespace Medbiohim\Database;

use Medbiohim\Support\Env;
use Medbiohim\Support\Logger;
use PDO;

final class Connection
{
    private static ?PDO $pdo = null;
    private static ?string $lastError = null;

    public static function lastError(): ?string
    {
        return self::$lastError;
    }

    /**
     * Shared hosting (SpaceWeb) often runs PHP with HOME=/root.
     * libpq then tries to read /root/.postgresql/postgresql.crt → Permission denied.
     * Neutralize client-cert lookup before any PDO connect.
     */
    private static function prepareSslEnv(): void
    {
        $home = sys_get_temp_dir();
        if (!is_dir($home) || !is_writable($home)) {
            $home = '/tmp';
        }
        @putenv('HOME=' . $home);
        @putenv('PGSSLCERT=');
        @putenv('PGSSLKEY=');
        @putenv('PGSSLROOTCERT=');
        @putenv('PGSSLMODE=require');
        $pgDir = $home . '/.postgresql';
        if (!is_dir($pgDir)) {
            @mkdir($pgDir, 0700, true);
        }
    }

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $cfg = self::config();
        if ($cfg['host'] === '' || $cfg['user'] === '') {
            throw new \RuntimeException('Database is not configured (DB_URL or DB_HOST / DB_USER)');
        }
        if (!extension_loaded('pdo_pgsql')) {
            throw new \RuntimeException('pdo_pgsql extension is required');
        }

        self::prepareSslEnv();

        $attempts = [
            ['host' => $cfg['host'], 'port' => $cfg['port'], 'sslmode' => $cfg['sslmode']],
        ];
        if ($cfg['port'] === '5432') {
            $attempts[] = ['host' => $cfg['host'], 'port' => '6543', 'sslmode' => $cfg['sslmode']];
        }
        if ($cfg['sslmode'] === 'require') {
            $attempts[] = ['host' => $cfg['host'], 'port' => $cfg['port'], 'sslmode' => 'prefer'];
            $attempts[] = ['host' => $cfg['host'], 'port' => $cfg['port'], 'sslmode' => 'disable'];
        }

        $errors = [];
        foreach ($attempts as $i => $a) {
            $dsn = sprintf(
                'pgsql:host=%s;port=%s;dbname=%s;sslmode=%s;connect_timeout=%d',
                $a['host'],
                $a['port'],
                $cfg['name'],
                $a['sslmode'],
                $cfg['connect_timeout']
            );
            try {
                self::$pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => true,
                ]);
                self::$pdo->query('SELECT 1');
                self::$lastError = null;
                if ($i > 0) {
                    Logger::info('db_connected_fallback', [
                        'host' => $a['host'],
                        'port' => $a['port'],
                        'sslmode' => $a['sslmode'],
                    ]);
                }
                return self::$pdo;
            } catch (\Throwable $e) {
                $errors[] = $a['port'] . '/' . $a['sslmode'] . ': ' . $e->getMessage();
                self::$pdo = null;
            }
        }

        self::$lastError = implode(' | ', $errors);
        Logger::error('db_unavailable', [
            'message' => self::$lastError,
            'host' => $cfg['host'],
            'user' => $cfg['user'],
        ]);
        throw new \RuntimeException('Database connection failed: ' . self::safeError(self::$lastError));
    }

    public static function available(): bool
    {
        try {
            self::pdo()->query('SELECT 1');
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function reset(): void
    {
        self::$pdo = null;
    }

    /** @return array{host:string,port:string,name:string,user:string,pass:string,sslmode:string,connect_timeout:int} */
    public static function config(): array
    {
        $url = trim((string) (Env::get('DB_URL', '') ?? ''));
        $host = (string) (Env::get('DB_HOST', '') ?? '');
        $name = (string) (Env::get('DB_NAME', 'postgres') ?? 'postgres');
        $user = (string) (Env::get('DB_USER', '') ?? '');
        $pass = (string) (Env::get('DB_PASSWORD', '') ?? '');
        $port = (string) (Env::get('DB_PORT', '5432') ?? '5432');
        $sslmode = (string) (Env::get('DB_SSLMODE', 'require') ?? 'require');
        $connectTimeout = (int) (Env::get('DB_CONNECT_TIMEOUT', '8') ?: 8);

        if ($url !== '') {
            $url = preg_replace('#^postgresql://#i', 'postgres://', $url) ?? $url;
            $parsed = parse_url($url);
            if (!is_array($parsed) || empty($parsed['host'])) {
                throw new \RuntimeException('DB_URL is invalid');
            }
            $host = (string) $parsed['host'];
            $port = (string) ($parsed['port'] ?? 5432);
            $name = ltrim((string) ($parsed['path'] ?? '/postgres'), '/') ?: 'postgres';
            if (isset($parsed['user'])) {
                $user = rawurldecode((string) $parsed['user']);
            }
            if (isset($parsed['pass'])) {
                $pass = rawurldecode((string) $parsed['pass']);
            }
            if (isset($parsed['query'])) {
                parse_str((string) $parsed['query'], $query);
                if (isset($query['sslmode']) && is_string($query['sslmode'])) {
                    $sslmode = $query['sslmode'];
                }
            }
        }

        if ($pass === '' && Env::get('DB_PASSWORD')) {
            $pass = (string) Env::get('DB_PASSWORD');
        }

        return [
            'host' => $host,
            'port' => $port,
            'name' => $name,
            'user' => $user,
            'pass' => $pass,
            'sslmode' => $sslmode,
            'connect_timeout' => max(3, $connectTimeout),
        ];
    }

    private static function safeError(string $msg): string
    {
        $msg = preg_replace('/:[^:@\/\s]{4,}@/', ':***@', $msg) ?? $msg;
        return substr($msg, 0, 400);
    }
}
