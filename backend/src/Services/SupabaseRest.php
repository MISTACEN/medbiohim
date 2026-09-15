<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

/** HTTPS fallback to Supabase PostgREST when outbound PostgreSQL is unavailable. */
final class SupabaseRest
{
    private static function request(string $method, string $path, ?array $body = null, array $extraHeaders = []): array
    {
        $base = rtrim((string) Env::get('SUPABASE_URL', ''), '/');
        $key = (string) Env::get('SUPABASE_SERVICE_KEY', '');
        if ($base === '' || $key === '') {
            throw new \RuntimeException('Supabase REST fallback is not configured');
        }
        $res = HttpClient::request($method, $base . '/rest/v1/' . ltrim($path, '/'), $body, array_merge([
            'apikey: ' . $key,
            'Authorization: Bearer ' . $key,
        ], $extraHeaders), 15);
        if ($res['status'] < 200 || $res['status'] >= 300) {
            $detail = is_array($res['json']) ? json_encode($res['json'], JSON_UNESCAPED_UNICODE) : trim($res['body']);
            throw new \RuntimeException('Supabase REST request failed (' . $res['status'] . '): ' . substr((string) $detail, 0, 500));
        }
        return is_array($res['json']) ? $res['json'] : [];
    }

    public static function listGroups(): array
    {
        $select = 'id,code,name,course_number,admission_year,is_active,created_at';
        return self::request('GET', 'groups?is_active=eq.true&select=' . rawurlencode($select) . '&order=course_number.asc.nullslast,name.asc');
    }

    public static function createGroup(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') throw new \InvalidArgumentException('Group name is required');
        $base = trim((string) ($data['code'] ?? '')) ?: self::makeCode($name);
        for ($i = 0; $i < 8; $i++) {
            $code = $i === 0 ? $base : $base . '-' . ($i + 1);
            try {
                $rows = self::request('POST', 'groups', [
                    'code' => $code,
                    'name' => $name,
                    'course_number' => $data['course_number'] ?? null,
                    'admission_year' => $data['admission_year'] ?? null,
                ], ['Prefer: return=representation']);
                if (!isset($rows[0]) || !is_array($rows[0])) throw new \RuntimeException('Supabase REST create group returned no row');
                return $rows[0];
            } catch (\Throwable $e) {
                if ($i >= 7 || !str_contains($e->getMessage(), '(409)')) throw $e;
            }
        }
        throw new \RuntimeException('Could not create group');
    }

    public static function listSubjects(?int $course = null, ?int $semester = null): array
    {
        $select = 'id,name,course_number,semester,control_type,lecture_hours,practice_hours,is_active';
        $path = 'subjects?is_active=eq.true&select=' . rawurlencode($select);
        if ($course !== null) $path .= '&course_number=eq.' . rawurlencode((string) $course);
        if ($semester !== null) $path .= '&semester=eq.' . rawurlencode((string) $semester);
        return self::request('GET', $path . '&order=course_number.asc.nullslast,semester.asc.nullslast,name.asc');
    }

    public static function createSubject(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') throw new \InvalidArgumentException('Subject name is required');
        $rows = self::request('POST', 'subjects', [
            'name' => $name,
            'course_number' => $data['course_number'] ?? null,
            'semester' => $data['semester'] ?? null,
            'control_type' => $data['control_type'] ?? null,
            'lecture_hours' => $data['lecture_hours'] ?? null,
            'practice_hours' => $data['practice_hours'] ?? null,
        ], ['Prefer: return=representation']);
        if (!isset($rows[0]) || !is_array($rows[0])) throw new \RuntimeException('Supabase REST create subject returned no row');
        return $rows[0];
    }

    private static function makeCode(string $name): string
    {
        $map = ['а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'e','ж'=>'zh','з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'c','ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya'];
        $value = strtr(mb_strtolower($name, 'UTF-8'), $map);
        $value = preg_replace('/[^a-z0-9]+/u', '-', $value) ?? '';
        $value = trim($value, '-');
        return substr($value !== '' ? $value : 'group', 0, 80);
    }
}
