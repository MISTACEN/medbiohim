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
        if (self::$pdo instanceof PDO) return self::$pdo;
        $url = trim((string)(Env::get('DB_URL','') ?? ''));
        $host = Env::get('DB_HOST'); $name = Env::get('DB_NAME','postgres'); $user = Env::get('DB_USER'); $pass = Env::get('DB_PASSWORD','') ?? ''; $port = Env::get('DB_PORT','5432'); $sslmode = Env::get('DB_SSLMODE','require');
        if ($url !== '') {
            $parsed = parse_url($url);
            if (!is_array($parsed) || empty($parsed['host'])) throw new \RuntimeException('DB_URL is invalid');
            $host=(string)$parsed['host']; $port=(string)($parsed['port']??5432); $name=ltrim((string)($parsed['path']??'/postgres'),'/');
            $user=isset($parsed['user'])?rawurldecode((string)$parsed['user']):$user; $pass=isset($parsed['pass'])?rawurldecode((string)$parsed['pass']):$pass;
            if(isset($parsed['query'])){parse_str((string)$parsed['query'],$query);if(isset($query['sslmode'])&&is_string($query['sslmode']))$sslmode=$query['sslmode'];}
        }
        $connectTimeout=(int)(Env::get('DB_CONNECT_TIMEOUT','8')?:8);
        if(!$host||!$user) throw new \RuntimeException('Database is not configured (DB_URL or DB_HOST / DB_USER)');
        if(!extension_loaded('pdo_pgsql')) throw new \RuntimeException('pdo_pgsql extension is required');
        $parts=['pgsql:host='.$host,'port='.$port,'dbname='.$name]; if($sslmode!=='')$parts[]='sslmode='.$sslmode;
        self::$pdo=new PDO(implode(';',$parts),$user,$pass,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false,PDO::ATTR_TIMEOUT=>max(3,$connectTimeout)]);
        return self::$pdo;
    }
    public static function available(): bool { try{self::pdo()->query('SELECT 1');return true;}catch(\Throwable $e){Logger::error('db_unavailable',['message'=>$e->getMessage(),'host'=>Env::get('DB_HOST',''),'port'=>Env::get('DB_PORT','5432')]);return false;} }
    public static function reset(): void { self::$pdo=null; }
}
// synced 2026-09-15
