<?php
declare(strict_types=1);
namespace Medbiohim\Support;
final class ContentStore {
 private string $dir;
 public function __construct(?string $dir=null){$this->dir=$dir?:dirname(__DIR__,2).'/data';if(!is_dir($this->dir))@mkdir($this->dir,0775,true);}
 private function read(string $file,mixed $default):mixed{$p=$this->dir.'/'.$file;if(!is_file($p))return $default;$raw=file_get_contents($p);if($raw===false||trim($raw)==='')return $default;$v=json_decode($raw,true);return $v??$default;}
 private function write(string $file,mixed $data):mixed{$p=$this->dir.'/'.$file;$tmp=$p.'.tmp';$json=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);if($json===false)throw new \RuntimeException('Could not encode content');if(file_put_contents($tmp,$json.PHP_EOL,LOCK_EX)===false)throw new \RuntimeException('Could not write content');if(!@rename($tmp,$p)){@unlink($tmp);throw new \RuntimeException('Could not replace content file');}return $data;}
 public function getSite():array{$d=$this->read('site.json',[]);return array_merge(['title'=>'Медбиохим','subtitle'=>'Учебная платформа','description'=>'','announcement_banner'=>'','contacts'=>[]],isset($d['site'])&&is_array($d['site'])?$d['site']:[]);}
 public function updateSite(array $patch):array{$s=$this->getSite();foreach($patch as $k=>$v)$s[$k]=$v;$this->write('site.json',['site'=>$s,'updated_at'=>gmdate('c')]);return $s;}
 public function listAnnouncements():array{$d=$this->read('announcements.json',[]);return isset($d['items'])&&is_array($d['items'])?$d['items']:(is_array($d)?$d:[]);}
 public function createAnnouncement(array $d):array{$a=$this->listAnnouncements();$r=array_merge(['id'=>bin2hex(random_bytes(8)),'created_at'=>gmdate('c'),'pinned'=>false],$d);$a[]=$r;$this->write('announcements.json',['items'=>$a]);return $r;}
 public function updateAnnouncement(string $id,array $patch):?array{$a=$this->listAnnouncements();foreach($a as $i=>$r)if((string)($r['id']??'')===$id){$a[$i]=array_merge($r,$patch,['updated_at'=>gmdate('c')]);$this->write('announcements.json',['items'=>$a]);return $a[$i];}return null;}
 public function deleteAnnouncement(string $id):bool{$a=$this->listAnnouncements();$b=array_values(array_filter($a,static fn($r)=>(string)($r['id']??'')!==$id));if(count($a)===count($b))return false;$this->write('announcements.json',['items'=>$b]);return true;}
 public function listCurriculum():array{$d=$this->read('curriculum.json',['items'=>[]]);return isset($d['items'])&&is_array($d['items'])?$d['items']:[];}
 public function saveCurriculum(array $items):array{$this->write('curriculum.json',['version'=>2,'items'=>array_values($items),'updated_at'=>gmdate('c')]);return array_values($items);}
 public function curriculumPlan():array{$d=$this->read('curriculum.json',[]);return is_array($d)?$d:[];}
 public function listTestsLocal():array{$d=$this->read('tests.json',[]);return isset($d['items'])&&is_array($d['items'])?$d['items']:(is_array($d)?$d:[]);}
 public function saveTestsLocal(array $items):array{$this->write('tests.json',['items'=>array_values($items),'updated_at'=>gmdate('c')]);return array_values($items);}
 public function listSchedule():array{$d=$this->read('schedule.json',[]);return isset($d['items'])&&is_array($d['items'])?$d['items']:(is_array($d)?$d:[]);}
 public function listCommunityPosts():array{$d=$this->read('community.json',[]);return isset($d['items'])&&is_array($d['items'])?$d['items']:(is_array($d)?$d:[]);}
 public function createCommunityPost(array $d):array{$a=$this->listCommunityPosts();$r=array_merge(['id'=>bin2hex(random_bytes(8)),'created_at'=>gmdate('c')],$d);$a[]=$r;$this->write('community.json',['items'=>$a]);return $r;}
 public function updateCommunityPost(string $id,array $patch):?array{$a=$this->listCommunityPosts();foreach($a as $i=>$r)if((string)($r['id']??'')===$id){$a[$i]=array_merge($r,$patch,['updated_at'=>gmdate('c')]);$this->write('community.json',['items'=>$a]);return $a[$i];}return null;}
 public function deleteCommunityPost(string $id):bool{$a=$this->listCommunityPosts();$b=array_values(array_filter($a,static fn($r)=>(string)($r['id']??'')!==$id));if(count($a)===count($b))return false;$this->write('community.json',['items'=>$b]);return true;}
}
