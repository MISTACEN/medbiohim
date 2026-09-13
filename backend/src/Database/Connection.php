<?php
declare(strict_types=1);

namespace Medbiohim\Database;

use Medbiohim\Support\Env;
use Medbiohim\Support\Logger;
use PDO;

final class Connection
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $host = Env::get('DB_HOST');
        $name = Env::get('DB_NAME', 'postgres');
        $user = Env::get('DB_USER');
        $pass = Env::get('DB_PASSWORD', '') ?? '';
        $port = Env::get('DB_PORT', '5432');

        if (!$host || !$user) {
            throw new \RuntimeException('Database is not configured (DB_HOST / DB_USER)');
        }

        if (!extension_loaded('pdo_pgsql')) {
            throw new \RuntimeException('pdo_pgsql extension is required');
        }

        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $host, $port, $name);
        self::$pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);

        return self::$pdo;
    }

    public static function available(): bool
    {
        try {
            self::pdo()->query('SELECT 1');
            return true;
        } catch (\Throwable $e) {
            Logger::error('db_unavailable', ['message' => $e->getMessage()]);
            return false;
        }
    }

    public static function reset(): void
    {
        self::$pdo = null;
    }
}
