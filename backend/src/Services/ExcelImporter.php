<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
use Medbiohim\Support\XlsxReader;

final class ExcelImporter
{
    private static function request(string $method,string $path,?array $body=null,array $headers=[]):array
    {
        $url=rtrim((string)Env::get('SUPABASE_URL',''),'/');$key=(string)Env::get('SUPABASE_SERVICE_KEY','');
        if($url===''||$key==='')throw new \RuntimeException('Supabase REST fallback is not configured');
        $x=HttpClient::request($method,$url.'/rest/v1/'.ltrim($path,'/'),$body,array_merge(['apikey: '.$key,'Authorization: Bearer '.$key],$headers),20);
        if($x['status']<200||$x['status']>=300){$d=is_array($x['json'])?(string)json_encode($x['json'],JSON_UNESCAPED_UNICODE):trim((string)$x['body']);throw new \RuntimeException('Supabase import request failed ('.$x['status'].'): '.substr($d,0,800));}
        return is_array($x['json'])?$x['json']:[];
    }
    private static function norm(string $v):string{return mb_strtolower(trim(preg_replace('/\s+/u',' ',$v)??''),'UTF-8');}
    private static function headers(array $row):array{$out=[];foreach($row as $k=>$v){$key=self::norm((string)$v);if($key!=='')$out[$key]=(int)$k;}return $out;}
    private static function cell(array $row,array $h,array $names):string{foreach($names as $name){$k=self::norm($name);if(isset($h[$k]))return trim((string)($row[$h[$k]]??''));}return '';}
    private static function toInt(?string $v):?int{if($v===null||trim($v)==='')return null;if(preg_match('/-?\d+/',$v,$m))return (int)$m[0];return null;}
    private static function parseTime(string $v):array{if(preg_match('/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/',$v,$m))return [$m[1],$m[2]];return [$v,''];}

    public static function importCurriculum(string $binary):array
    {
        $rows=XlsxReader::firstSheetRows($binary);if(count($rows)<2)throw new \InvalidArgumentException('В XLSX нет строк для импорта');
        $h=self::headers(array_shift($rows));$saved=0;$updated=0;$skipped=0;$errors=[];
        foreach($rows as $i=>$row){
            $name=self::cell($row,$h,['Дисциплина','Предмет','Название']);$semester=self::toInt(self::cell($row,$h,['Семестр']));
            if($name===''||$semester===null){$skipped++;continue;}
            $course=(int)ceil($semester/2);$lecture=self::toInt(self::cell($row,$h,['Лекции','Лекции, ч']));$practice=self::toInt(self::cell($row,$h,['Практические','Практика','Практические, ч']));$control=self::cell($row,$h,['Форма контроля','Контроль']);
            try{
                $q='subjects?name=eq.'.rawurlencode($name).'&course_number=eq.'.(int)$course.'&semester=eq.'.(int)$semester.'&select=id&limit=1';
                $existing=self::request('GET',$q);
                $payload=['name'=>$name,'course_number'=>$course,'semester'=>$semester,'control_type'=>$control!==''?$control:null,'lecture_hours'=>$lecture,'practice_hours'=>$practice,'is_active'=>true];
                if($existing){self::request('PATCH','subjects?id=eq.'.rawurlencode((string)$existing[0]['id']),$payload,['Prefer: return=minimal']);$updated++;}
                else{self::request('POST','subjects',$payload,['Prefer: return=minimal']);$saved++;}
            }catch(\Throwable $e){$errors[]=['row'=>$i+2,'message'=>$e->getMessage()];}
        }
        return ['mode'=>'curriculum','rows'=>count($rows)+1,'created'=>$saved,'updated'=>$updated,'skipped'=>$skipped,'errors'=>$errors];
    }

    public static function importSchedule(string $binary,string $groupId,?int $semester=null):array
    {
        $rows=XlsxReader::firstSheetRows($binary);if(count($rows)<2)throw new \InvalidArgumentException('В XLSX нет строк для импорта');
        $h=self::headers(array_shift($rows));$subjectRows=self::request('GET','subjects?is_active=eq.true&select=id,name,semester&order=name.asc');$subjects=[];foreach($subjectRows as $s)$subjects[self::norm((string)$s['name'])][]=$s;
        $entries=[];$errors=[];
        foreach($rows as $i=>$row){
            $date=self::cell($row,$h,['Дата','date']);$time=self::cell($row,$h,['Время','Время занятия','time']);[$start,$end]=self::parseTime($time);$start=$start!==''?$start:self::cell($row,$h,['Начало','Время начала']);$end=$end!==''?$end:self::cell($row,$h,['Конец','Время окончания']);$name=self::cell($row,$h,['Дисциплина','Предмет']);
            if($date===''||$start===''||$end===''||$name===''){ $errors[]=['row'=>$i+2,'message'=>'Не хватает Дата/Время/Дисциплина'];continue; }
            $candidates=$subjects[self::norm($name)]??[];$subject=null;foreach($candidates as $s){if($semester===null||(int)($s['semester']??0)===$semester){$subject=$s;break;}}if(!$subject){$errors[]=['row'=>$i+2,'message'=>'Предмет не найден: '.$name];continue;}
            $entries[]=['subject_id'=>$subject['id'],'date'=>$date,'start_time'=>$start,'end_time'=>$end,'type'=>self::cell($row,$h,['Тип','Вид'])?:'other','room'=>self::cell($row,$h,['Аудитория','Кабинет']),'building'=>self::cell($row,$h,['Корпус']),'notes'=>self::cell($row,$h,['Примечание','Примечания'])];
        }
        $schedule=self::createSchedule($groupId,$semester,$entries);
        return ['mode'=>'schedule','rows'=>count($rows)+1,'saved'=>$schedule['entries_saved'],'schedule_id'=>$schedule['schedule_id'],'version'=>$schedule['version'],'errors'=>$errors];
    }

    private static function createSchedule(string $groupId,?int $semester,array $entries):array
    {
        $existing=self::request('GET','schedules?group_id=eq.'.rawurlencode($groupId).($semester!==null?'&semester=eq.'.(int)$semester:'').'&select=id,version&order=version.desc&limit=1');
        $version=$existing?((int)($existing[0]['version']??0)+1):1;
        $x=self::request('POST','schedules',['group_id'=>$groupId,'semester'=>$semester,'version'=>$version],['Prefer: return=representation']);$sid=$x[0]['id']??null;if(!$sid)throw new \RuntimeException('Не удалось создать расписание');
        $n=0;foreach($entries as $entry){self::request('POST','schedule_entries',['schedule_id'=>$sid]+$entry,['Prefer: return=minimal']);$n++;}
        return ['schedule_id'=>$sid,'version'=>$version,'entries_saved'=>$n];
    }
}
