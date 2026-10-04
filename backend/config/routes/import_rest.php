<?php
declare(strict_types=1);
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Services\ExcelImporter;
use Medbiohim\Support\Multipart;
return static function(Router $r):void{
    $gate=static function(Request $q):bool{return RequireAuth::handle($q)&&RequireRole::handle($q,['teacher','moderator','admin']);};
    $r->post('/api/v1/admin/import/curriculum',static function(Request $q,array $p)use($gate):void{
        if(!$gate($q))return;
        $mp=Multipart::firstFile('file');if($mp===null){Response::error('VALIDATION_ERROR','Выберите XLSX-файл',$q->requestId,422);return;}
        try{Response::success(ExcelImporter::importCurriculum($mp['binary']),$q->requestId);}catch(\InvalidArgumentException $e){Response::error('VALIDATION_ERROR',$e->getMessage(),$q->requestId,422);}catch(\Throwable $e){\Medbiohim\Support\Logger::error('curriculum_import_failed',['requestId'=>$q->requestId,'message'=>$e->getMessage()]);Response::error('IMPORT_FAILED','Не удалось импортировать учебный план',$q->requestId,500);}
    });
    
};
