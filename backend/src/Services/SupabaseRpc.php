<?php
declare(strict_types=1);
namespace Medbiohim\Services;
use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
final class SupabaseRpc {
 public static function adminImport(array $payload,string $actor,bool $dryRun=false):array{
  $base=rtrim((string)Env::get('SUPABASE_URL',''),'/');$key=(string)Env::get('SUPABASE_SERVICE_KEY','');
  if($base===''||$key==='')throw new \RuntimeException('Supabase REST is not configured');
  $res=HttpClient::request('POST',$base.'/rest/v1/rpc/admin_import_content_atomic',['payload'=>$payload,'actor'=>$actor,'dry_run'=>$dryRun],['apikey: '.$key,'Authorization: Bearer '.$key,'Content-Type: application/json'],30);
  if($res['status']<200||$res['status']>=300)throw new \RuntimeException('Supabase RPC failed ('.$res['status'].'): '.substr(is_array($res['json'])?(string)json_encode($res['json'],JSON_UNESCAPED_UNICODE):trim((string)$res['body']),0,1000));
  return is_array($res['json'])?$res['json']:[];
 }
}
