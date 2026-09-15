<?php
declare(strict_types=1);

namespace Medbiohim\Health;

use Medbiohim\Support\Env;

final class HealthChecker
{
    private const REQUIRED_EXTENSIONS=['curl','json','mbstring','openssl','fileinfo','pdo','pdo_pgsql'];
    public function check():array{
        $checks=['php'=>$this->checkPhp(),'extensions'=>$this->checkExtensions(),'config'=>$this->checkConfig(),'database'=>$this->checkDatabase(),'b2'=>$this->checkB2Config(),'supabase_auth'=>$this->checkSupabaseAuthConfig()];
        $statuses=array_column($checks,'status');$overall=in_array('fail',$statuses,true)?'unhealthy':(in_array('warn',$statuses,true)?'degraded':'healthy');
        return ['status'=>$overall,'service'=>'medbiohim-api','version'=>'0.5.0-phase-d','phase'=>'D','php'=>PHP_VERSION,'time'=>date('c'),'checks'=>$checks];
    }
    private function checkPhp():array{$ok=version_compare(PHP_VERSION,'8.2.0','>=');return['status'=>$ok?'ok':'fail','message'=>$ok?'PHP '.PHP_VERSION:'PHP 8.2+ required, got '.PHP_VERSION];}
    private function checkExtensions():array{$loaded=[];$missing=[];foreach(self::REQUIRED_EXTENSIONS as $ext){if(extension_loaded($ext))$loaded[]=$ext;else$missing[]=$ext;}$strict=Env::get('APP_ENV')==='production';return['status'=>$missing===[]?'ok':($strict?'fail':'warn'),'loaded'=>$loaded,'missing'=>$missing];}
    private function checkConfig():array{$keys=['APP_ENV','SUPABASE_URL','SUPABASE_SERVICE_KEY','SUPABASE_ANON_KEY','DB_URL','B2_KEY_ID','B2_APPLICATION_KEY','B2_BUCKET','B2_ENDPOINT','CORS_ORIGINS'];$present=[];$missing=[];foreach($keys as $key){$v=Env::get($key);if($v!==null&&$v!=='')$present[]=$key;else$missing[]=$key;}return['status'=>in_array('SUPABASE_URL',$missing,true)?'warn':'ok','present'=>$present,'missing'=>$missing];}
    private function checkDatabase():array{
        $url=trim((string)(Env::get('DB_URL','')??''));$host=Env::get('DB_HOST');$name=Env::get('DB_NAME');$user=Env::get('DB_USER');$pass=Env::get('DB_PASSWORD');$port=Env::get('DB_PORT','5432');
        if($url!==''){ $parsed=parse_url($url);if(!is_array($parsed)||empty($parsed['host']))return['status'=>'fail','message'=>'DB_URL is invalid'];$host=(string)$parsed['host'];$port=(string)($parsed['port']??5432);$name=ltrim((string)($parsed['path']??'/postgres'),'/');$user=isset($parsed['user'])?rawurldecode((string)$parsed['user']):$user;$pass=isset($parsed['pass'])?rawurldecode((string)$parsed['pass']):$pass; }
        if(!$host||!$name||!$user)return['status'=>'warn','message'=>'Database not configured (DB_URL or DB_HOST/DB_USER)'];
        if(!extension_loaded('pdo_pgsql'))return['status'=>'fail','message'=>'pdo_pgsql not loaded'];
        $dsn=sprintf('pgsql:host=%s;port=%s;dbname=%s',$host,$port,$name);$sslmode=Env::get('DB_SSLMODE','require');if($sslmode!=='')$dsn.=';sslmode='.$sslmode;
        try{$pdo=new \PDO($dsn,$user,$pass??'', [\PDO::ATTR_ERRMODE=>\PDO::ERRMODE_EXCEPTION,\PDO::ATTR_TIMEOUT=>max(3,(int)(Env::get('DB_CONNECT_TIMEOUT','8')?:8))]);$pdo->query('SELECT 1');return['status'=>'ok','message'=>'Connected'];}
        catch(\Throwable $e){$message=strtolower($e->getMessage());$hint='Connection failed';if(str_contains($message,'could not translate host')||str_contains($message,'getaddrinfo'))$hint='DNS/host resolution failed';elseif(str_contains($message,'connection timed out')||str_contains($message,'timed out'))$hint='Connection timed out';elseif(str_contains($message,'password authentication failed'))$hint='Database authentication failed';elseif(str_contains($message,'no pg_hba')||str_contains($message,'ssl'))$hint='PostgreSQL SSL/network policy rejected the connection';if(is_string($host)&&str_starts_with($host,'db.')&&str_ends_with($host,'.supabase.co'))$hint.='; SpaceWeb IPv4 usually needs the Supabase Session pooler (port 5432)';return['status'=>'fail','message'=>$hint];}
    }
    private function checkB2Config():array{$configured=Env::get('B2_KEY_ID')&&Env::get('B2_APPLICATION_KEY')&&Env::get('B2_BUCKET')&&Env::get('B2_ENDPOINT');return['status'=>$configured?'ok':'warn','configured'=>(bool)$configured,'message'=>$configured?'B2 credentials present':'B2 not configured (Phase D)'];}
    private function checkSupabaseAuthConfig():array{$url=Env::get('SUPABASE_URL');$anon=Env::get('SUPABASE_ANON_KEY');$service=Env::get('SUPABASE_SERVICE_KEY');if(!$url)return['status'=>'fail','message'=>'SUPABASE_URL missing'];if(!$anon||!$service)return['status'=>'fail','message'=>'Supabase Auth keys missing'];return['status'=>'ok','message'=>'Supabase Auth config present','has_anon'=>true,'has_service'=>true];}
}
// synced 2026-09-15
