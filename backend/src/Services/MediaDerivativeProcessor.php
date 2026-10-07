<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Repositories\FileRepository;
use Medbiohim\Repositories\FileVariantRepository;

final class MediaDerivativeProcessor
{
    public function __construct(
        private readonly FileRepository $files = new FileRepository(),
        private readonly FileVariantRepository $variants = new FileVariantRepository(),
        private readonly B2Storage $storage = new B2Storage(),
        private readonly MediaQualityPolicy $policy = new MediaQualityPolicy(),
        private readonly MediaQualityAnalyzer $analyzer = new MediaQualityAnalyzer(),
    ) {}

    public function processImage(string $fileId, string $binary): array
    {
        $file=$this->files->findById($fileId);
        if($file===null) throw new \RuntimeException('File not found');
        if(!$this->storage->isConfigured()) throw new \RuntimeException('B2 is not configured');
        $finfo=new \finfo(FILEINFO_MIME_TYPE);
        $mime=(string)($finfo->buffer($binary)?:'');
        if(!str_starts_with($mime,'image/')) throw new \InvalidArgumentException('Only images are supported');
        $size=@getimagesizefromstring($binary);
        if($size===false) throw new \RuntimeException('Unable to inspect image');
        $sw=(int)$size[0]; $sh=(int)$size[1]; $kind=$this->classify($file);
        $plans=[];
        if(function_exists('imagewebp')){
            $plans[]=['key'=>$this->webpKey($kind,'high'),'mime'=>'image/webp','quality'=>94,'scale'=>1.0];
            $plans[]=['key'=>$this->webpKey($kind,'compact'),'mime'=>'image/webp','quality'=>82,'scale'=>0.82];
        }
        if(function_exists('imageavif')){
            $plans[]=['key'=>$this->avifKey($kind,'high'),'mime'=>'image/avif','quality'=>86,'scale'=>1.0];
            $plans[]=['key'=>$this->avifKey($kind,'compact'),'mime'=>'image/avif','quality'=>72,'scale'=>0.82];
        }
        $generated=[]; $candidates=[];
        foreach($plans as $p){
            $max=in_array($kind,['text-heavy','diagram','scan'],true)?2560:2048;
            $scale=(float)($p['scale']??1.0); $w=min($sw,(int)floor($max*$scale)); $w=max(1,$w); $h=max(1,(int)round($sh*($w/max(1,$sw))));
            $key=$p['key'];
            $this->variants->upsert($fileId,['variant_key'=>$key,'object_key'=>(string)$file['object_key'].'.derivatives/'.$key,'processing_status'=>'processing']);
            $out=$this->encode($binary,$w,$h,$p['mime'],$p['quality']);
            if($out===null){$this->variants->markStatus($fileId,$key,'failed');continue;}
            $c=['key'=>$key,'size_bytes'=>strlen($out),'width'=>$w,'height'=>$h,...$this->analyzer->compare($binary,$out)];
            $candidates[]=$c; $generated[$key]=['plan'=>$p,'binary'=>$out,'width'=>$w,'height'=>$h];
        }
        $decision=$this->policy->choose($candidates,$kind,$sw,$sh);
        $selected=(string)($decision['selected']['key']??'');
        foreach($generated as $key=>$g){
            if($key!==$selected){$this->variants->markStatus($fileId,$key,'skipped');continue;}
            $object=(string)$file['object_key'].'.derivatives/'.$key;
            try{
                $up=$this->storage->upload($object,$g['binary'],$g['plan']['mime']);
                $this->variants->upsert($fileId,['variant_key'=>$key,'mime_type'=>$g['plan']['mime'],'size_bytes'=>strlen($g['binary']),'object_key'=>$object,'b2_file_id'=>$up['b2_file_id']??null,'sha256'=>hash('sha256',$g['binary']),'width'=>$g['width'],'height'=>$g['height'],'processing_status'=>'ready']);
            }catch(\Throwable $e){$this->variants->markStatus($fileId,$key,'failed');}
        }
        return ['file_id'=>$fileId,'source_mime'=>$mime,'kind'=>$kind,'source'=>['width'=>$sw,'height'=>$sh,'size_bytes'=>strlen($binary)],'selected'=>$decision['selected'],'rejected'=>$decision['rejected'],'variants'=>$this->variants->listForFile($fileId),'original_preserved'=>true];
    }

    private function encode(string $binary,int $w,int $h,string $mime,int $quality):?string
    {
        if(!extension_loaded('gd'))return null;
        $src=@imagecreatefromstring($binary); if($src===false)return null;
        $dst=imagecreatetruecolor($w,$h); imagealphablending($dst,false); imagesavealpha($dst,true);
        imagecopyresampled($dst,$src,0,0,0,0,$w,$h,imagesx($src),imagesy($src));
        $tmp=tempnam(sys_get_temp_dir(),'mbh-'); if($tmp===false){imagedestroy($src);imagedestroy($dst);return null;}
        $ok=$mime==='image/webp'&&function_exists('imagewebp')?imagewebp($dst,$tmp,$quality):($mime==='image/avif'&&function_exists('imageavif')?imageavif($dst,$tmp,$quality,6):false);
        imagedestroy($src); imagedestroy($dst); $out=$ok?@file_get_contents($tmp):false; @unlink($tmp);
        return is_string($out)&&$out!==''?$out:null;
    }
    private function classify(array $file):string{ $n=mb_strtolower((string)($file['original_name']??'')); if(str_contains($n,'electron')||str_contains($n,'электрон'))return'electronogram'; if(str_contains($n,'atlas')||str_contains($n,'атлас'))return'atlas'; if(str_contains($n,'diagram')||str_contains($n,'схем'))return'diagram'; return'photo'; }
    private function webpKey(string $k,string $profile):string{ $base=in_array($k,['electronogram','atlas'],true)?'webp-detail':'webp'; return $base.'-'.$profile; }
    private function avifKey(string $k,string $profile):string{ $base=in_array($k,['electronogram','atlas'],true)?'avif-detail':'avif'; return $base.'-'.$profile; }
}