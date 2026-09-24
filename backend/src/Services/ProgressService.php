<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

final class ProgressService
{
    private static function request(string $method, string $path): array
    {
        $url = rtrim((string) Env::get('SUPABASE_URL', ''), '/');
        $key = (string) Env::get('SUPABASE_SERVICE_KEY', '');
        if ($url === '' || $key === '') throw new \RuntimeException('Supabase REST is not configured');
        $res = HttpClient::request($method, $url . '/rest/v1/' . ltrim($path, '/'), null, [
            ...SupabaseKeyHeaders::service($key),
        ], 15);
        if ($res['status'] < 200 || $res['status'] >= 300) {
            $body = is_array($res['json']) ? json_encode($res['json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : trim((string) $res['body']);
            throw new \RuntimeException('Supabase progress request failed (' . $res['status'] . '): ' . substr((string) $body, 0, 700));
        }
        return is_array($res['json']) ? $res['json'] : [];
    }

    private static function inList(array $ids): string
    {
        $ids = array_values(array_unique(array_filter(array_map(static fn($x) => trim((string) $x), $ids))));
        return '(' . implode(',', array_map(static fn(string $id) => '"' . $id . '"', $ids)) . ')';
    }

    public static function forUser(string $userId): array
    {
        $userRows = self::request('GET', 'users?id=eq.' . rawurlencode($userId) . '&select=course_number');
        $course = isset($userRows[0]['course_number']) ? (int) $userRows[0]['course_number'] : null;

        $subjectPath = 'subjects?is_active=eq.true&select=id,name,course_number,semester,control_type';
        if ($course !== null) $subjectPath .= '&course_number=eq.' . $course;
        $subjects = self::request('GET', $subjectPath . '&order=semester.asc.nullslast,name.asc');

        $subjectIds = array_values(array_filter(array_map(static fn($x) => (string) ($x['id'] ?? ''), $subjects)));
        $subjectProgress = [];
        if ($subjectIds) {
            foreach (self::request('GET', 'user_subject_progress?user_id=eq.' . rawurlencode($userId) . '&subject_id=in.' . rawurlencode(self::inList($subjectIds)) . '&select=subject_id,percent,completed_topics_count,last_activity_at,updated_at') as $row) {
                $subjectProgress[(string) ($row['subject_id'] ?? '')] = $row;
            }
        }

        $ledger = self::request('GET', 'progress_ledger?user_id=eq.' . rawurlencode($userId) . '&select=id,object_type,object_id,status,percent,score,max_score,attempts,metadata,last_activity_at,updated_at&order=last_activity_at.desc.nullslast&limit=200');
        $ledgerBySubject = [];
        foreach ($ledger as $row) {
            $meta = is_array($row['metadata'] ?? null) ? $row['metadata'] : [];
            $sid = (string) ($meta['subject_id'] ?? '');
            if ($sid !== '') $ledgerBySubject[$sid][] = $row;
        }

        $attempts = self::request('GET', 'test_attempts?user_id=eq.' . rawurlencode($userId) . '&select=id,test_id,started_at,finished_at,score,max_score,percent,status&order=started_at.desc.nullslast');
        $finishedAttempts = 0;
        $scoreSum = 0.0;
        $scoreCount = 0;
        foreach ($attempts as $attempt) {
            if (($attempt['finished_at'] ?? null) !== null || (string) ($attempt['status'] ?? '') === 'finished') $finishedAttempts++;
            if (is_numeric($attempt['percent'] ?? null)) {
                $scoreSum += (float) $attempt['percent'];
                $scoreCount++;
            } elseif (is_numeric($attempt['score'] ?? null) && is_numeric($attempt['max_score'] ?? null) && (float) $attempt['max_score'] > 0) {
                $scoreSum += ((float) $attempt['score'] / (float) $attempt['max_score']) * 100;
                $scoreCount++;
            }
        }

        $homeworkRows = self::request('GET', 'homeworks?select=id,subject_id,group_id,title,due_at,created_at&order=due_at.asc.nullslast');
        $homeworkIds = array_values(array_filter(array_map(static fn($x) => (string) ($x['id'] ?? ''), $homeworkRows)));
        $submissions = [];
        if ($homeworkIds) {
            foreach (self::request('GET', 'homework_submissions?user_id=eq.' . rawurlencode($userId) . '&homework_id=in.' . rawurlencode(self::inList($homeworkIds)) . '&select=homework_id,status,grade,submitted_at,updated_at') as $row) {
                $submissions[(string) ($row['homework_id'] ?? '')] = $row;
            }
        }

        $hwTotal = count($homeworkRows);
        $hwDone = 0;
        foreach ($homeworkRows as $hw) {
            $status = (string) ($submissions[(string) ($hw['id'] ?? '')]['status'] ?? '');
            if (in_array($status, ['submitted', 'graded', 'done', 'сдано', 'оценено'], true)) $hwDone++;
        }

        $topicProgress = self::request('GET', 'user_topic_progress?user_id=eq.' . rawurlencode($userId) . '&select=topic_id,status,percent,last_activity_at&order=last_activity_at.desc.nullslast&limit=200');
        $topicIds = array_values(array_filter(array_map(static fn($x) => (string) ($x['topic_id'] ?? ''), $topicProgress)));
        $topics = [];
        if ($topicIds) {
            foreach (self::request('GET', 'topics?id=in.' . rawurlencode(self::inList($topicIds)) . '&select=id,title,module_id') as $topic) {
                $topics[(string) ($topic['id'] ?? '')] = $topic;
            }
        }

        $subjectCards = [];
        $subjectPercents = [];
        foreach ($subjects as $subject) {
            $sid = (string) ($subject['id'] ?? '');
            $percent = isset($subjectProgress[$sid]['percent']) ? (float) $subjectProgress[$sid]['percent'] : null;
            $activity = $ledgerBySubject[$sid] ?? [];
            if ($percent === null && $activity) {
                $vals = array_values(array_filter(array_map(static fn($x) => is_numeric($x['percent'] ?? null) ? (float) $x['percent'] : null, $activity), static fn($x) => $x !== null));
                if ($vals) $percent = array_sum($vals) / count($vals);
            }
            $percent = $percent === null ? 0.0 : max(0.0, min(100.0, $percent));
            $subjectPercents[] = $percent;
            $subjectCards[] = [
                'id' => $sid,
                'name' => $subject['name'] ?? 'Предмет',
                'course' => $subject['course_number'] ?? null,
                'semester' => $subject['semester'] ?? null,
                'control_type' => $subject['control_type'] ?? null,
                'percent' => round($percent, 1),
                'completed_topics_count' => (int) ($subjectProgress[$sid]['completed_topics_count'] ?? 0),
                'last_activity_at' => $subjectProgress[$sid]['last_activity_at'] ?? null,
            ];
        }

        $overall = $subjectPercents ? array_sum($subjectPercents) / count($subjectPercents) : 0.0;
        if (!$subjectPercents && $ledger) {
            $vals = array_values(array_filter(array_map(static fn($x) => is_numeric($x['percent'] ?? null) ? (float) $x['percent'] : null, $ledger), static fn($x) => $x !== null));
            if ($vals) $overall = array_sum($vals) / count($vals);
        }

        $weakTopics = [];
        foreach ($topicProgress as $row) {
            $tid = (string) ($row['topic_id'] ?? '');
            $weakTopics[] = [
                'id' => $tid,
                'title' => $topics[$tid]['title'] ?? 'Тема',
                'status' => $row['status'] ?? null,
                'percent' => round((float) ($row['percent'] ?? 0), 1),
                'last_activity_at' => $row['last_activity_at'] ?? null,
            ];
        }
        usort($weakTopics, static fn($a, $b) => ($a['percent'] <=> $b['percent']));
        $weakTopics = array_slice($weakTopics, 0, 8);

        $recent = [];
        foreach ($ledger as $row) {
            $recent[] = [
                'id' => $row['id'] ?? null,
                'object_type' => $row['object_type'] ?? null,
                'status' => $row['status'] ?? null,
                'percent' => isset($row['percent']) ? (float) $row['percent'] : null,
                'score' => isset($row['score']) ? (float) $row['score'] : null,
                'max_score' => isset($row['max_score']) ? (float) $row['max_score'] : null,
                'last_activity_at' => $row['last_activity_at'] ?? ($row['updated_at'] ?? null),
            ];
        }

        return [
            'overall_pct' => round($overall, 1),
            'course' => $course,
            'subjects' => $subjectCards,
            'weak_topics' => $weakTopics,
            'recent_activity' => array_slice($recent, 0, 12),
            'ledger' => ['count' => count($ledger)],
            'homework' => [
                'total' => $hwTotal,
                'done' => $hwDone,
                'percent' => $hwTotal ? round(($hwDone / $hwTotal) * 100, 1) : 0,
                'items' => $homeworkRows,
            ],
            'tests' => [
                'attempts' => count($attempts),
                'finished' => $finishedAttempts,
                'avg_score' => $scoreCount ? round($scoreSum / $scoreCount, 1) : null,
                'items' => $attempts,
            ],
            'note' => $ledger ? 'единый ledger + активности' : 'активность пока не накоплена',
        ];
    }
}
