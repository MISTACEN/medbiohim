<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

final class ScheduleRestStore
{
    private static function request(string $method, string $path): array
    {
        $url = rtrim((string) Env::get('SUPABASE_URL', ''), '/');
        $key = (string) Env::get('SUPABASE_SERVICE_KEY', '');
        if ($url === '' || $key === '') throw new \RuntimeException('Supabase REST is not configured');
        $res = HttpClient::request($method, $url . '/rest/v1/' . ltrim($path, '/'), null, ['apikey: ' . $key, 'Authorization: Bearer ' . $key], 15);
        if ($res['status'] < 200 || $res['status'] >= 300) {
            $body = is_array($res['json']) ? json_encode($res['json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : trim((string) $res['body']);
            throw new \RuntimeException('Supabase schedule request failed (' . $res['status'] . '): ' . substr((string) $body, 0, 700));
        }
        return is_array($res['json']) ? $res['json'] : [];
    }

    private static function inUuidList(array $ids): string
    {
        $clean = [];
        foreach ($ids as $id) {
            $id = trim((string) $id);
            if ($id !== '' && preg_match('/^[0-9a-fA-F-]{36}$/', $id)) $clean[] = $id;
        }
        return '(' . implode(',', array_values(array_unique($clean))) . ')';
    }

    public static function listForUser(string $userId, ?string $from = null, ?string $to = null): array
    {
        $users = self::request('GET', 'users?id=eq.' . rawurlencode($userId) . '&select=course_number,semester');
        $userCourse = $users[0]['course_number'] ?? null;
        $userSemester = isset($users[0]['semester']) && $users[0]['semester'] !== null ? (int) $users[0]['semester'] : null;

        $memberships = self::request('GET', 'group_memberships?user_id=eq.' . rawurlencode($userId) . '&is_active=eq.true&select=group_id');
        $groupIds = [];
        foreach ($memberships as $row) if (!empty($row['group_id'])) $groupIds[] = (string) $row['group_id'];

        if (!$groupIds) return [];

        $groupFilter = self::inUuidList($groupIds);
        $semesterFilter = $userSemester !== null ? '&semester=eq.' . $userSemester : '';
        $schedules = self::request('GET', 'schedules?group_id=in.' . $groupFilter . '&is_active=eq.true' . $semesterFilter . '&select=id,group_id,semester,version,academic_year,created_at&order=group_id.asc,semester.asc.nullslast,version.desc,created_at.desc');

        $latest = [];
        foreach ($schedules as $schedule) {
            $key = (string) ($schedule['group_id'] ?? '') . ':' . (string) ($schedule['semester'] ?? '0');
            if ($key !== ':' && !isset($latest[$key])) $latest[$key] = $schedule;
        }
        if (!$latest) return [];

        $scheduleIds = array_values(array_filter(array_map(static fn($x) => (string) ($x['id'] ?? ''), array_values($latest))));
        $entryPath = 'schedule_entries?schedule_id=in.' . self::inUuidList($scheduleIds) . '&select=id,schedule_id,subject_id,subject_name,date,start_time,end_time,type,event_kind,is_makeup,session_id,room,building,notes,is_cancelled,teacher,academic_hours,week_parity,recurrence_group,parent_entry_id,source_detail,source&order=date.asc,start_time.asc';
        if ($from !== null && $from !== '') $entryPath .= '&date=gte.' . rawurlencode($from);
        if ($to !== null && $to !== '') $entryPath .= '&date=lte.' . rawurlencode($to);
        $entries = self::request('GET', $entryPath);

        $groupMap = [];
        foreach (self::request('GET', 'groups?id=in.' . $groupFilter . '&select=id,name,code,course_number') as $group) {
            $groupMap[(string) ($group['id'] ?? '')] = $group;
        }

        $subjectIds = array_values(array_unique(array_filter(array_map(static fn($x) => (string) ($x['subject_id'] ?? ''), $entries))));
        $subjectMap = [];
        if ($subjectIds) {
            foreach (self::request('GET', 'subjects?id=in.' . self::inUuidList($subjectIds) . '&select=id,name') as $subject) {
                $subjectMap[(string) ($subject['id'] ?? '')] = (string) ($subject['name'] ?? '');
            }
        }

        $scheduleMap = [];
        foreach ($latest as $schedule) $scheduleMap[(string) ($schedule['id'] ?? '')] = $schedule;

        $out = [];
        foreach ($entries as $entry) {
            $schedule = $scheduleMap[(string) ($entry['schedule_id'] ?? '')] ?? [];
            $groupId = (string) ($schedule['group_id'] ?? '');
            $group = $groupMap[$groupId] ?? [];
            $subjectId = (string) ($entry['subject_id'] ?? '');
            $subjectName = trim((string) ($entry['subject_name'] ?? ''));
            if ($subjectName === '' && $subjectId !== '') $subjectName = $subjectMap[$subjectId] ?? '';

            $out[] = [
                'id' => $entry['id'] ?? null,
                'schedule_id' => $entry['schedule_id'] ?? null,
                'group_id' => $groupId !== '' ? $groupId : null,
                'group_name' => $group['name'] ?? null,
                'group_code' => $group['code'] ?? null,
                'course_number' => $group['course_number'] ?? null,
                'semester' => $schedule['semester'] ?? null,
                'version' => $schedule['version'] ?? null,
                'academic_year' => $schedule['academic_year'] ?? '2026/2027',
                'subject_id' => $entry['subject_id'] ?? null,
                'subject_name' => $subjectName !== '' ? $subjectName : null,
                'date' => $entry['date'] ?? null,
                'start_time' => $entry['start_time'] ?? null,
                'end_time' => $entry['end_time'] ?? null,
                'type' => (string) ($entry['type'] ?? 'other'),
                'event_kind' => (string) ($entry['event_kind'] ?? 'class'),
                'is_makeup' => (bool) ($entry['is_makeup'] ?? false),
                'session_id' => $entry['session_id'] ?? null,
                'room' => $entry['room'] ?? null,
                'building' => $entry['building'] ?? null,
                'notes' => $entry['notes'] ?? null,
                'is_cancelled' => (bool) ($entry['is_cancelled'] ?? false),
                'teacher' => $entry['teacher'] ?? null,
                'academic_hours' => isset($entry['academic_hours']) ? (int)$entry['academic_hours'] : null,
                'week_parity' => $entry['week_parity'] ?? null,
                'recurrence_group' => $entry['recurrence_group'] ?? null,
                'parent_entry_id' => $entry['parent_entry_id'] ?? null,
                'source_detail' => $entry['source_detail'] ?? null,
                'event_kind' => (string)($entry['event_kind'] ?? 'class'),
                'is_makeup' => (bool)($entry['is_makeup'] ?? false),
                'session_id' => $entry['session_id'] ?? null,
                'source' => $entry['source'] ?? 'official',
            ];
        }
        usort($out, static fn(array $a, array $b): int => ((string)($a['date'] ?? '') . ' ' . (string)($a['start_time'] ?? '')) <=> ((string)($b['date'] ?? '') . ' ' . (string)($b['start_time'] ?? '')));
        return $out;
    }
}
