<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

final class SupabaseAcademic
{
    private static function request(string $method, string $path, ?array $body = null, array $headers = []): array
    {
        $url = rtrim((string) Env::get('SUPABASE_URL', ''), '/');
        $key = (string) Env::get('SUPABASE_SERVICE_KEY', '');
        if ($url === '' || $key === '') {
            throw new \RuntimeException('Supabase REST fallback is not configured');
        }
        $attempts = 0;
        do {
            $attempts++;
            $res = HttpClient::request(
                $method,
                $url . '/rest/v1/' . ltrim($path, '/'),
                $body,
                array_merge(SupabaseKeyHeaders::service($key), $headers),
                15
            );
            if ($res['status'] >= 200 && $res['status'] < 300) {
                return is_array($res['json']) ? $res['json'] : [];
            }
            $transient = $res['status'] === 0 || in_array($res['status'], [502, 503, 504], true);
            if (!$transient || $attempts >= 3) break;
            usleep(180000 * $attempts);
        } while ($attempts < 3);

        $detail = is_array($res['json'])
            ? (string) json_encode($res['json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            : trim((string) $res['body']);
        throw new \RuntimeException('Supabase REST request failed (' . $res['status'] . '): ' . substr($detail, 0, 700));
    }

    private static function csvQuoted(array $values): string
    {
        return implode(',', array_map(static function ($value): string {
            return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], (string) $value) . '"';
        }, $values));
    }

    public static function subjectDetail(string $subjectId): ?array
    {
        $subjects = self::request(
            'GET',
            'subjects?id=eq.' . rawurlencode($subjectId)
            . '&select=id,name,course_number,semester,control_type,lecture_hours,practice_hours,self_study_hours,total_hours,credits,is_active'
        );
        if (!$subjects) return null;

        $modules = self::request(
            'GET',
            'modules?subject_id=eq.' . rawurlencode($subjectId)
            . '&select=id,title,order_index&order=order_index.asc.nullslast,title.asc'
        );
        $moduleIds = [];
        foreach ($modules as $module) {
            if (isset($module['id'])) $moduleIds[] = (string) $module['id'];
        }

        $topicsByModule = [];
        if ($moduleIds) {
            $topics = self::request(
                'GET',
                'topics?module_id=in.(' . self::csvQuoted(array_values(array_unique($moduleIds))) . ')'
                . '&select=id,module_id,title,order_index&order=order_index.asc.nullslast,title.asc'
            );
            foreach ($topics as $topic) {
                $mid = (string) ($topic['module_id'] ?? '');
                if ($mid === '') continue;
                $topicsByModule[$mid][] = [
                    'id' => $topic['id'] ?? null,
                    'title' => $topic['title'] ?? '',
                    'order_index' => (int) ($topic['order_index'] ?? 0),
                ];
            }
        }

        $outModules = [];
        foreach ($modules as $module) {
            $mid = (string) ($module['id'] ?? '');
            $outModules[] = [
                'id' => $module['id'] ?? null,
                'title' => $module['title'] ?? '',
                'order_index' => (int) ($module['order_index'] ?? 0),
                'topics' => $topicsByModule[$mid] ?? [],
            ];
        }

        return ['subject' => $subjects[0], 'modules' => $outModules];
    }

    public static function curriculum(?int $course = null, ?int $semester = null): array
    {
        $path = 'subjects?is_active=eq.true&select=id,name,course_number,semester,control_type,lecture_hours,practice_hours,is_active';
        if ($course !== null) $path .= '&course_number=eq.' . (int) $course;
        if ($semester !== null) $path .= '&semester=eq.' . (int) $semester;
        $path .= '&order=course_number.asc.nullslast,semester.asc.nullslast,name.asc';
        $subjects = self::request('GET', $path);

        $items = [];
        foreach ($subjects as $subject) {
            $items[] = [
                'id' => $subject['id'] ?? null,
                'subject' => $subject['name'] ?? '',
                'course' => isset($subject['course_number']) ? (int) $subject['course_number'] : null,
                'semester' => isset($subject['semester']) ? (int) $subject['semester'] : null,
                'control' => $subject['control_type'] ?? null,
                'lecture_hours' => $subject['lecture_hours'] ?? null,
                'practice_hours' => $subject['practice_hours'] ?? null,
                'progress_pct' => 0,
                'modules' => [],
            ];
        }
        return $items;
    }

    public static function homeworksForUser(string $userId): array
    {
        $memberships = self::request(
            'GET',
            'group_memberships?user_id=eq.' . rawurlencode($userId)
            . '&is_active=eq.true&select=group_id'
        );
        $groupIds = [];
        foreach ($memberships as $membership) {
            if (!empty($membership['group_id'])) $groupIds[] = (string) $membership['group_id'];
        }

        $filters = ['group_id=is.null'];
        if ($groupIds) {
            $filters[] = 'group_id=in.(' . self::csvQuoted(array_values(array_unique($groupIds))) . ')';
        }
        $homeworks = self::request(
            'GET',
            'homeworks?or=(' . implode(',', $filters) . ')'
            . '&select=id,title,description,due_at,subject_id,group_id,created_by,created_at'
            . '&order=due_at.asc.nullslast,created_at.desc'
        );
        if (!$homeworks) return [];

        $subjectIds = [];
        $homeworkIds = [];
        foreach ($homeworks as $homework) {
            if (!empty($homework['subject_id'])) $subjectIds[] = (string) $homework['subject_id'];
            if (!empty($homework['id'])) $homeworkIds[] = (string) $homework['id'];
        }

        $subjects = [];
        if ($subjectIds) {
            foreach (self::request(
                'GET',
                'subjects?id=in.(' . self::csvQuoted(array_values(array_unique($subjectIds))) . ')&select=id,name'
            ) as $subject) {
                $subjects[(string) $subject['id']] = $subject['name'] ?? null;
            }
        }

        $submissions = [];
        if ($homeworkIds) {
            foreach (self::request(
                'GET',
                'homework_submissions?homework_id=in.(' . self::csvQuoted(array_values(array_unique($homeworkIds))) . ')'
                . '&user_id=eq.' . rawurlencode($userId)
                . '&select=id,homework_id,status,grade,submitted_at'
            ) as $submission) {
                $submissions[(string) ($submission['homework_id'] ?? '')] = $submission;
            }
        }

        foreach ($homeworks as &$homework) {
            $homework['subject_name'] = !empty($homework['subject_id'])
                ? ($subjects[(string) $homework['subject_id']] ?? null)
                : null;
            $submission = $submissions[(string) ($homework['id'] ?? '')] ?? null;
            if (is_array($submission)) {
                $homework['submission_id'] = $submission['id'] ?? null;
                $homework['my_status'] = $submission['status'] ?? null;
                $homework['grade'] = $submission['grade'] ?? null;
                $homework['submitted_at'] = $submission['submitted_at'] ?? null;
            }
        }
        unset($homework);
        return $homeworks;
    }

    public static function communityPosts(int $limit = 100): array
    {
        return self::request(
            'GET',
            'community_posts?is_deleted=eq.false&select=id,author_id,title,body,created_at,updated_at'
            . '&order=created_at.desc&limit=' . max(1, min($limit, 200))
        );
    }

    public static function createCommunityPost(string $authorId, string $title, string $body): array
    {
        $rows = self::request(
            'POST',
            'community_posts',
            ['author_id' => $authorId, 'title' => $title, 'body' => $body, 'is_deleted' => false],
            ['Prefer: return=representation']
        );
        if (!$rows) throw new \RuntimeException('Community post was not created');
        return $rows[0];
    }
}
