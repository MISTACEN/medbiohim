<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use Medbiohim\Support\Env;
use PDO;
use PDOStatement;
use RuntimeException;

final class AdminDatabaseManager
{
    private const MAX_ROWS = 500;
    private const MAX_SQL = 120000;

    public function listConnections(): array
    {
        $items = [[
            'id'=>'supabase_primary',
            'slug'=>'supabase_primary',
            'label'=>'Основная БД · Supabase',
            'driver'=>'pgsql',
            'host'=>'server-config',
            'port'=>null,
            'database_name'=>'postgres',
            'username'=>'server-config',
            'password_configured'=>true,
            'sslmode'=>Env::get('DB_SSLMODE','require'),
            'charset'=>'UTF8',
            'enabled'=>true,
            'builtin'=>true,
            'status'=>'unknown',
            'last_test_ok'=>null,
            'last_tested_at'=>null,
            'last_error'=>null,
        ]];

        $stmt=Connection::pdo()->query(
            'SELECT id,slug,label,driver,host,port,database_name,username,password_ciphertext,
                    sslmode,charset,enabled,updated_at,last_tested_at,last_test_ok,last_error
             FROM public.admin_db_connections ORDER BY slug'
        );
        foreach(($stmt->fetchAll(PDO::FETCH_ASSOC)?:[]) as $row){
            $items[]=[
                'id'=>(string)$row['id'],
                'slug'=>(string)$row['slug'],
                'label'=>(string)$row['label'],
                'driver'=>(string)$row['driver'],
                'host'=>(string)$row['host'],
                'port'=>(int)$row['port'],
                'database_name'=>(string)$row['database_name'],
                'username'=>(string)$row['username'],
                'password_configured'=>!empty($row['password_ciphertext']),
                'sslmode'=>$row['sslmode']??null,
                'charset'=>$row['charset']??null,
                'enabled'=>(bool)$row['enabled'],
                'builtin'=>false,
                'status'=>!empty($row['last_test_ok'])?'connected':(!empty($row['last_tested_at'])?'failed':'untested'),
                'last_test_ok'=>$row['last_test_ok']===null?null:(bool)$row['last_test_ok'],
                'last_tested_at'=>$row['last_tested_at'],
                'last_error'=>$row['last_error'],
                'updated_at'=>$row['updated_at'],
            ];
        }
        return $items;
    }

    public function connectionById(string $id): array
    {
        if($id==='supabase_primary'){
            $cfg=Connection::config();
            return [
                'id'=>'supabase_primary','slug'=>'supabase_primary','label'=>'Основная БД · Supabase',
                'driver'=>'pgsql','host'=>$cfg['host'],'port'=>(int)$cfg['port'],
                'database_name'=>$cfg['name'],'username'=>$cfg['user'],
                'password_ciphertext'=>null,'sslmode'=>$cfg['sslmode'],'charset'=>'UTF8',
                'enabled'=>true,'builtin'=>true,
            ];
        }
        $stmt=Connection::pdo()->prepare(
            'SELECT id,slug,label,driver,host,port,database_name,username,password_ciphertext,
                    sslmode,charset,enabled,last_tested_at,last_test_ok,last_error
             FROM public.admin_db_connections WHERE id=:id LIMIT 1'
        );
        $stmt->execute(['id'=>$id]);
        $row=$stmt->fetch(PDO::FETCH_ASSOC);
        if(!$row)throw new RuntimeException('Подключение не найдено');
        if(!$row['enabled'])throw new RuntimeException('Подключение отключено');
        return $row;
    }

    public function saveConnection(array $input,string $actorId,?string $id=null): array
    {
        $label=trim((string)($input['label']??''));
        $slug=trim((string)($input['slug']??$id??''));
        $driver=strtolower(trim((string)($input['driver']??'pgsql')));
        $host=trim((string)($input['host']??''));
        $port=(int)($input['port']??0);
        $database=trim((string)($input['database_name']??''));
        $username=trim((string)($input['username']??''));
        $password=(string)($input['password']??'');
        $sslmode=trim((string)($input['sslmode']??'require'));
        $charset=trim((string)($input['charset']??'utf8mb4'));
        $enabled=array_key_exists('enabled',$input)?(bool)$input['enabled']:true;

        if($slug===''||!preg_match('/^[a-z0-9][a-z0-9_-]{1,63}$/',$slug))throw new RuntimeException('Некорректный идентификатор подключения');
        if($label==='')throw new RuntimeException('Название подключения обязательно');
        if(!in_array($driver,['pgsql','mysql'],true))throw new RuntimeException('Поддерживаются только PostgreSQL и MySQL');
        if($host===''||strlen($host)>255)throw new RuntimeException('Хост подключения некорректен');
        if($port<1||$port>65535)throw new RuntimeException('Порт подключения некорректен');
        if($database===''||strlen($database)>128)throw new RuntimeException('Имя базы обязательно');
        if($username===''||strlen($username)>128)throw new RuntimeException('Логин базы обязателен');

        $pdo=Connection::pdo();
        $existing=$pdo->prepare('SELECT id,password_ciphertext FROM public.admin_db_connections WHERE slug=:slug LIMIT 1');
        $existing->execute(['slug'=>$slug]);
        $old=$existing->fetch(PDO::FETCH_ASSOC)?:null;
        $ciphertext=$old['password_ciphertext']??null;
        if($password!=='')$ciphertext=$this->encrypt($password);
        if(!$old&&$ciphertext===null)throw new RuntimeException('Для нового подключения укажите пароль');

        if($old){
            $stmt=$pdo->prepare(
                'UPDATE public.admin_db_connections
                 SET label=:label,driver=:driver,host=:host,port=:port,database_name=:database_name,
                     username=:username,password_ciphertext=:password_ciphertext,sslmode=:sslmode,
                     charset=:charset,enabled=:enabled,updated_at=now(),last_tested_at=NULL,last_test_ok=NULL,last_error=NULL
                 WHERE id=:id'
            );
            $stmt->execute([
                'label'=>$label,'driver'=>$driver,'host'=>$host,'port'=>$port,'database_name'=>$database,
                'username'=>$username,'password_ciphertext'=>$ciphertext,'sslmode'=>$sslmode?:null,
                'charset'=>$charset?:null,'enabled'=>$enabled,'id'=>$old['id'],
            ]);
            $rowId=(string)$old['id'];
        }else{
            $stmt=$pdo->prepare(
                'INSERT INTO public.admin_db_connections
                 (slug,label,driver,host,port,database_name,username,password_ciphertext,sslmode,charset,enabled,created_by)
                 VALUES (:slug,:label,:driver,:host,:port,:database_name,:username,:password_ciphertext,:sslmode,:charset,:enabled,:created_by)
                 RETURNING id'
            );
            $stmt->execute([
                'slug'=>$slug,'label'=>$label,'driver'=>$driver,'host'=>$host,'port'=>$port,'database_name'=>$database,
                'username'=>$username,'password_ciphertext'=>$ciphertext,'sslmode'=>$sslmode?:null,
                'charset'=>$charset?:null,'created_by'=>$actorId,
            ]);
            $rowId=(string)$stmt->fetchColumn();
        }
        return $this->publicConnection($this->connectionById($rowId));
    }

    private function publicConnection(array $row): array
    {
        $row['password_configured']=!empty($row['password_ciphertext']);
        unset($row['password_ciphertext']);
        $row['builtin']=false;
        return $row;
    }

    public function test(string $id): array
    {
        $started=microtime(true);
        try{
            $pdo=$this->open($id);
            $version=(string)$pdo->query($this->versionQuery($id))->fetchColumn();
            $latency=(int)round((microtime(true)-$started)*1000);
            if($id!=='supabase_primary'){
                $stmt=Connection::pdo()->prepare(
                    'UPDATE public.admin_db_connections
                     SET last_tested_at=now(),last_test_ok=true,last_error=NULL,updated_at=now() WHERE id=:id'
                );
                $stmt->execute(['id'=>$id]);
            }
            return ['ok'=>true,'latency_ms'=>$latency,'version'=>$version];
        }catch(\Throwable $e){
            if($id!=='supabase_primary'){
                try{
                    $stmt=Connection::pdo()->prepare(
                        'UPDATE public.admin_db_connections
                         SET last_tested_at=now(),last_test_ok=false,last_error=:error,updated_at=now() WHERE id=:id'
                    );
                    $stmt->execute(['id'=>$id,'error'=>$this->safeError($e->getMessage())]);
                }catch(\Throwable $ignore){}
            }
            throw new RuntimeException('Подключение не установлено: '.$this->safeError($e->getMessage()),0,$e);
        }
    }

    public function tables(string $id): array
    {
        $pdo=$this->open($id);
        if($this->driver($id)==='pgsql'){
            $sql='SELECT n.nspname AS schema_name,c.relname AS table_name,
                         CASE WHEN c.reltuples<0 THEN NULL ELSE c.reltuples::bigint END AS estimated_rows,
                         obj_description(c.oid,\'pg_class\') AS comment
                  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE c.relkind IN (\'r\',\'p\') AND n.nspname=\'public\' ORDER BY c.relname';
        }else{
            $sql='SELECT TABLE_SCHEMA AS schema_name,TABLE_NAME AS table_name,
                         TABLE_ROWS AS estimated_rows,TABLE_COMMENT AS comment
                  FROM information_schema.tables
                  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\' ORDER BY TABLE_NAME';
        }
        return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC)?:[];
    }

    public function schema(string $id,string $table): array
    {
        $this->assertTable($table);
        $pdo=$this->open($id);
        if($this->driver($id)==='pgsql'){
            $stmt=$pdo->prepare(
                'SELECT c.column_name,c.data_type,c.udt_name,c.is_nullable,c.column_default,c.ordinal_position,
                        EXISTS(
                          SELECT 1 FROM information_schema.key_column_usage k
                          JOIN information_schema.table_constraints tc ON tc.constraint_name=k.constraint_name AND tc.table_schema=k.table_schema
                          WHERE tc.table_schema=\'public\' AND tc.table_name=c.table_name
                            AND tc.constraint_type=\'PRIMARY KEY\' AND k.column_name=c.column_name
                        ) AS is_primary_key
                 FROM information_schema.columns c
                 WHERE c.table_schema=\'public\' AND c.table_name=:table ORDER BY c.ordinal_position'
            );
            $stmt->execute(['table'=>$table]);
            return ['columns'=>$stmt->fetchAll(PDO::FETCH_ASSOC)?:[]];
        }
        $stmt=$pdo->prepare(
            'SELECT c.COLUMN_NAME AS column_name,c.DATA_TYPE AS data_type,c.COLUMN_TYPE AS udt_name,
                    c.IS_NULLABLE AS is_nullable,c.COLUMN_DEFAULT AS column_default,c.ORDINAL_POSITION AS ordinal_position,
                    CASE WHEN c.COLUMN_KEY=\'PRI\' THEN true ELSE false END AS is_primary_key
             FROM information_schema.columns c
             WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=:table ORDER BY c.ORDINAL_POSITION'
        );
        $stmt->execute(['table'=>$table]);
        return ['columns'=>$stmt->fetchAll(PDO::FETCH_ASSOC)?:[]];
    }

    public function rows(string $id,string $table,int $limit=100,int $offset=0,?string $q=null): array
    {
        $this->assertTable($table);
        $pdo=$this->open($id);$driver=$this->driver($id);
        $limit=max(1,min(self::MAX_ROWS,$limit));$offset=max(0,$offset);
        $schema=$this->schema($id,$table);$columns=$schema['columns']??[];
        $sql='SELECT * FROM '.$this->quote($driver,$table);$params=[];
        if($q!==null&&trim($q)!==''){
            $needle='%'.trim($q).'%';$terms=[];
            foreach($columns as $col){
                $name=(string)$col['column_name'];$param='q_'.$this->paramSafe($name);
                $cast=$driver==='pgsql'?'CAST('.$this->quoteColumn($driver,$name).' AS TEXT)':'CAST('.$this->quoteColumn($driver,$name).' AS CHAR)';
                $terms[]=$cast.' LIKE :'.$param;$params[$param]=$needle;
            }
            if($terms)$sql.=' WHERE '.implode(' OR ',$terms);
        }
        $order=(string)($columns[0]['column_name']??'');
        foreach($columns as $col)if(!empty($col['is_primary_key'])){$order=(string)$col['column_name'];break;}
        if($order!=='')$sql.=' ORDER BY '.$this->quoteColumn($driver,$order);
        $sql.=' LIMIT :limit OFFSET :offset';
        $stmt=$pdo->prepare($sql);
        foreach($params as $k=>$v)$stmt->bindValue(':'.$k,$v,PDO::PARAM_STR);
        $stmt->bindValue(':limit',$limit,PDO::PARAM_INT);$stmt->bindValue(':offset',$offset,PDO::PARAM_INT);
        $stmt->execute();
        return ['items'=>$stmt->fetchAll(PDO::FETCH_ASSOC)?:[],'columns'=>$columns,'limit'=>$limit,'offset'=>$offset];
    }

    public function insert(string $id,string $table,array $row): array
    {
        $this->assertTable($table);
        if(!$row)throw new RuntimeException('Строка пуста');
        $pdo=$this->open($id);$driver=$this->driver($id);$schema=$this->schema($id,$table);$allowed=[];
        foreach($schema['columns']??[] as $col)$allowed[(string)$col['column_name']=true;
        $data=array_intersect_key($row,$allowed);
        if(!$data)throw new RuntimeException('Нет допустимых колонок для вставки');
        $columns=array_keys($data);$holders=[];foreach($columns as $column)$holders[]=':p_'.$this->paramSafe($column);
        $quoted=array_map(fn($c)=>$this->quoteColumn($driver,$c),$columns);
        $stmt=$pdo->prepare('INSERT INTO '.$this->quote($driver,$table).'('.implode(',',$quoted).') VALUES('.implode(',',$holders).')');
        foreach($data as $column=>$value)$this->bindJson($stmt,':p_'.$this->paramSafe($column),$value);
        $stmt->execute();return ['affected_rows'=>$stmt->rowCount()];
    }

    public function update(string $id,string $table,array $key,array $row): array
    {
        $this->assertTable($table);
        if(!$key)throw new RuntimeException('Не указан ключ строки');
        $pdo=$this->open($id);$driver=$this->driver($id);$schema=$this->schema($id,$table);$valid=[];
        foreach($schema['columns']??[] as $col)$valid[(string)$col['column_name']=true;
        foreach(array_keys($key) as $k)if(!isset($valid[$k]))throw new RuntimeException('Недопустимый ключ: '.$k);
        $changes=array_diff_key($row,$key);if(!$changes)throw new RuntimeException('Изменений нет');
        $sets=[];$params=[];
        foreach($changes as $column=>$value){
            if(!isset($valid[$column]))continue;
            $name='p_'.$this->paramSafe($column);$sets[]=$this->quoteColumn($driver,$column).'=:'.$name;$params[$name]=$value;
        }
        if(!$sets)throw new RuntimeException('Нет допустимых изменений');
        $where=[];
        foreach($key as $column=>$value){
            $name='k_'.$this->paramSafe($column);$where[]=$this->quoteColumn($driver,$column).'=:'.$name;$params[$name]=$value;
        }
        $stmt=$pdo->prepare('UPDATE '.$this->quote($driver,$table).' SET '.implode(',',$sets).' WHERE '.implode(' AND ',$where));
        foreach($params as $name=>$value)$this->bindJson($stmt,':'.$name,$value);
        $stmt->execute();return ['affected_rows'=>$stmt->rowCount()];
    }

    public function delete(string $id,string $table,array $key): array
    {
        $this->assertTable($table);
        if(!$key)throw new RuntimeException('Не указан ключ строки');
        $pdo=$this->open($id);$driver=$this->driver($id);$where=[];$params=[];
        foreach($key as $column=>$value){$this->assertIdentifier($column);$name='k_'.$this->paramSafe($column);$where[]=$this->quoteColumn($driver,$column).'=:'.$name;$params[$name]=$value;}
        $stmt=$pdo->prepare('DELETE FROM '.$this->quote($driver,$table).' WHERE '.implode(' AND ',$where));
        foreach($params as $name=>$value)$this->bindJson($stmt,':'.$name,$value);
        $stmt->execute();return ['affected_rows'=>$stmt->rowCount()];
    }

    public function executeSql(string $id,string $sql,bool $confirmed): array
    {
        $sql=trim($sql);
        if($sql==='')throw new RuntimeException('SQL пустой');
        if(strlen($sql)>self::MAX_SQL)throw new RuntimeException('SQL слишком большой');
        $this->assertSqlAllowed($sql);
        $readOnly=(bool)preg_match('/^\s*(select|explain|show|describe|desc)\b/i',$sql);
        $dangerous=!$readOnly;
        if($dangerous&&!$confirmed)throw new RuntimeException('Операция изменяет БД. Повторите с подтверждением.');
        if($this->hasMultipleStatements($sql))throw new RuntimeException('За один запрос разрешён только один SQL-оператор');

        $pdo=$this->open($id);
        if($this->driver($id)==='pgsql')try{$pdo->exec('SET statement_timeout=20000');}catch(\Throwable $ignore){}
        $stmt=$pdo->query($sql);$hasColumns=$stmt->columnCount()>0;
        $rows=$hasColumns?($stmt->fetchAll(PDO::FETCH_ASSOC)?:[]):[];$columns=[];
        if($hasColumns)for($i=0;$i<$stmt->columnCount();$i++){$meta=$stmt->getColumnMeta($i);$columns[]=$meta['name']??('column_'.$i);}
        return ['command'=>$hasColumns?'query':'statement','columns'=>$columns,'rows'=>array_slice($rows,0,1000),'row_count'=>count($rows),'affected_rows'=>$hasColumns?null:$stmt->rowCount()];
    }

    private function open(string $id): PDO
    {
        if($id==='supabase_primary')return Connection::pdo();
        $row=$this->connectionById($id);$password=$this->decrypt((string)($row['password_ciphertext']??''));$driver=(string)$row['driver'];
        if($driver==='pgsql'){
            $ssl=(string)($row['sslmode']??'require');
            $dsn=sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=%s;connect_timeout=8',$row['host'],(int)$row['port'],$row['database_name'],$ssl);
            $pdo=new PDO($dsn,$row['username'],$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>true]);
            try{$pdo->exec('SET client_encoding TO UTF8');}catch(\Throwable $ignore){}
            return $pdo;
        }
        $charset=(string)($row['charset']?:'utf8mb4');
        $dsn=sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s',$row['host'],(int)$row['port'],$row['database_name'],$charset);
        return new PDO($dsn,$row['username'],$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>true]);
    }

    private function driver(string $id): string
    {
        return $id==='supabase_primary'?'pgsql':(string)$this->connectionById($id)['driver'];
    }
    private function versionQuery(string $id): string{return $this->driver($id)==='mysql'?'SELECT VERSION()':'SELECT version()';}

    private function encrypt(string $plaintext): string
    {
        $secret=Env::get('DB_CREDENTIALS_KEY')??Env::get('APP_ENCRYPTION_KEY')??Env::get('ADMIN_BOOTSTRAP_SECRET');
        if(!$secret)throw new RuntimeException('Не настроен серверный ключ DB_CREDENTIALS_KEY');
        $key=hash('sha256',$secret,true);$iv=random_bytes(12);$tag='';
        $cipher=openssl_encrypt($plaintext,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag);
        if($cipher===false)throw new RuntimeException('Не удалось зашифровать пароль');
        return 'v1:'.base64_encode($iv.$tag.$cipher);
    }

    private function decrypt(string $ciphertext): string
    {
        if($ciphertext==='')throw new RuntimeException('Пароль для подключения не задан');
        $secret=Env::get('DB_CREDENTIALS_KEY')??Env::get('APP_ENCRYPTION_KEY')??Env::get('ADMIN_BOOTSTRAP_SECRET');
        if(!$secret)throw new RuntimeException('Не настроен серверный ключ DB_CREDENTIALS_KEY');
        $raw=base64_decode(substr($ciphertext,3),true);
        if($raw===false||strlen($raw)<28)throw new RuntimeException('Некорректный сохранённый секрет');
        $plain=openssl_decrypt(substr($raw,28),'aes-256-gcm',hash('sha256',$secret,true),OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16));
        if($plain===false)throw new RuntimeException('Не удалось расшифровать пароль');
        return $plain;
    }

    private function quote(string $driver,string $table): string
    {
        return $driver==='mysql'?chr(96).$table.chr(96):'"'.$table.'"';
    }
    private function quoteColumn(string $driver,string $column): string
    {
        $this->assertIdentifier($column);return $driver==='mysql'?chr(96).$column.chr(96):'"'.$column.'"';
    }
    private function assertTable(string $table): void
    {
        if(!preg_match('/^[A-Za-z0-9_]{1,128}$/',$table))throw new RuntimeException('Недопустимое имя таблицы');
    }
    private function assertIdentifier(string $id): void
    {
        if(!preg_match('/^[A-Za-z0-9_]{1,128}$/',$id))throw new RuntimeException('Недопустимое имя идентификатора');
    }
    private function bindJson(PDOStatement $stmt,string $name,mixed $value): void
    {
        if($value===null){$stmt->bindValue($name,null,PDO::PARAM_NULL);return;}
        if(is_bool($value)){$stmt->bindValue($name,$value?1:0,PDO::PARAM_INT);return;}
        if(is_int($value)){$stmt->bindValue($name,$value,PDO::PARAM_INT);return;}
        if(is_float($value)){$stmt->bindValue($name,(string)$value,PDO::PARAM_STR);return;}
        if(is_array($value))$value=json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        $stmt->bindValue($name,(string)$value,PDO::PARAM_STR);
    }
    private function paramSafe(string $name): string{return preg_replace('/[^A-Za-z0-9_]/','_',substr($name,0,48))?:'x';}
    private function hasMultipleStatements(string $sql): bool
    {
        $quote=null;$len=strlen($sql);
        for($i=0;$i<$len;$i++){
            $ch=$sql[$i];
            if($quote!==null){
                if($ch==='\'){$i++;continue;}
                if($ch===$quote){if($i+1<$len&&$sql[$i+1]===$quote){$i++;continue;}$quote=null;}
                continue;
            }
            if($ch==="'"||$ch==='"'||ord($ch)===96){$quote=$ch;continue;}
            if($ch===';'&&trim(substr($sql,$i+1))!=='')return true;
        }
        return false;
    }
    private function assertSqlAllowed(string $sql): void
    {
        $lower=strtolower($sql);
        foreach(['pg_read_file','pg_ls_dir','lo_import','copy ','program','into outfile','into dumpfile','load_file(','\copy ','\connect ','\!','attach database','pragma'] as $blocked){
            if(str_contains($lower,$blocked))throw new RuntimeException('SQL-оператор заблокирован политикой безопасности');
        }
    }
    private function safeError(string $msg): string
    {
        $msg=preg_replace('/:[^:@\/\s]{4,}@/',':***@',$msg)??$msg;return substr($msg,0,600);
    }
}
