<?php
declare(strict_types=1);
use Medbiohim\Http\Request;use Medbiohim\Http\Response;use Medbiohim\Http\Router;use Medbiohim\Middleware\RequireAuth;use Medbiohim\Services\SupabaseRestProfile;
return static function(Router $r):void{$r->get('/api/v1/me',static function(Request $q,array $p):void{if(!RequireAuth::handle($q))return;try{Response::success(SupabaseRestProfile::bundle($q->user->id),$q->requestId);}catch(\Throwable $e){Response::success(['user'=>$q->user->toArray(),'roles'=>$q->user->role?[$q->user->role]:[],'groups'=>[],'course'=>null],$q->requestId);}});};
