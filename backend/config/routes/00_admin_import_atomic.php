<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\SupabaseRpc;
return static function(Router $router):void{
 $router->post('/api/v1/admin/content/import',static function(Request $req,array $params):void{
  if(!RequireAuth::handle($req)||!RequireRole::handle($req,['admin']))return;
  $payload=is_array($req->jsonBody??null)?$req->jsonBody:[];
  $dryRun=(bool)($payload['dry_run']??false); unset($payload['dry_run']);
  try{ $result=SupabaseRpc::adminImport($payload,$req->user->id,$dryRun); Response::success($result,$req->requestId,$dryRun?200:201); }
  catch(\Throwable $e){ Response::error('IMPORT_FAILED',$e->getMessage(),$req->requestId,422); }
 });
};
