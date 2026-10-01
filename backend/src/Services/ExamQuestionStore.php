<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

/**
 * Supabase-backed exam ticket store.
 * The public QuestionBank JSON remains a fallback for legacy deployments only.
 */
final class ExamQuestionStore
{
    private static function request(string $method, string $path, ?array $body = null, array $headers = []): array
    {
        $base = rtrim((string) Env::get('SUPABASE_URL', ''), '/');
        $key = (string) Env::get('SUPABASE_SERVICE_KEY', '');
        if ($base === '' || $key === '') {
            throw new \RuntimeException('Supabase REST is not configured');
        }
        $res = HttpClient::request(
            $method,
            $base . '/rest/v1/' . ltrim($path, '/'),
            $body,
            array_merge(SupabaseKeyHeaders::service($key), $headers),
            20
        );
        if ($res['status'] < 200 || $res['status'] >= 300) {
            $detail = is_array($res['json']) ? (string) json_encode($res['json'], JSON_UNESCAPED_UNICODE) : trim((string) $res['body']);
            throw new \RuntimeException('Supabase exam_questions request failed (' . $res['status'] . '): ' . substr($detail, 0, 900));
        }
        return is_array($res['json']) ? $res['json'] : [];
    }

    /** @return list<array<string,mixed>> */
    public static function list(array $filters = []): array
    {
        $select = 'id,subject_id,subject_name,subject_slug,topic,text,answer,kind,type,for_exam,for_ticket,source,is_published,created_at,updated_at';
        $path = 'exam_questions?select=' . rawurlencode($select) . '&order=subject_name.asc,id.asc';
        $rows = self::request('GET', $path);
        $slug = trim((string) ($filters['subject_slug'] ?? ''));
        $subject = mb_strtolower(trim((string) ($filters['subject'] ?? '')));
        $kind = trim((string) ($filters['kind'] ?? 'ticket'));
        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        if ($slug !== '' || $subject !== '' || $kind !== '' || $q !== '') {
            $rows = array_values(array_filter($rows, static function (array $row) use ($slug, $subject, $kind, $q): bool {
                if ($slug !== '' && (string) ($row['subject_slug'] ?? '') !== $slug) return false;
                if ($kind !== '' && (string) ($row['kind'] ?? '') !== $kind) return false;
                if ($subject !== '' && !str_contains(mb_strtolower((string) ($row['subject_name'] ?? '')), $subject)) return false;
                if ($q !== '') {
                    $hay = mb_strtolower((string) ($row['text'] ?? '') . ' ' . (string) ($row['topic'] ?? ''));
                    if (!str_contains($hay, $q)) return false;
                }
                return true;
            }));
        }
        return array_values($rows);
    }

    public static function get(string $id): ?array
    {
        $id = trim($id);
        if ($id === '') return null;
        $rows = self::request('GET', 'exam_questions?id=eq.' . rawurlencode($id) . '&select=id,subject_id,subject_name,subject_slug,topic,text,answer,kind,type,for_exam,for_ticket,source,is_published,created_at,updated_at');
        return $rows[0] ?? null;
    }

    /** @return list<array<string,mixed>> */
    public static function subjectsSummary(): array
    {
        $map = [];
        foreach (self::list(['kind' => 'ticket']) as $row) {
            $slug = (string) ($row['subject_slug'] ?? 'other');
            if (!isset($map[$slug])) {
                $map[$slug] = [
                    'subject' => (string) ($row['subject_name'] ?? $slug),
                    'subject_slug' => $slug,
                    'count' => 0,
                    'kinds' => ['ticket' => 0],
                ];
            }
            $map[$slug]['count']++;
            $map[$slug]['kinds']['ticket']++;
        }
        return array_values($map);
    }

    /** @return list<array<string,mixed>> */
    public static function banks(): array
    {
        $banks = self::request('GET', 'ticket_banks?select=id,subject_id,subject_name,subject_slug,title,mode,created_at,updated_at&order=subject_name.asc,title.asc');
        $counts = [];
        foreach (self::list(['kind' => 'ticket']) as $row) {
            $slug = (string) ($row['subject_slug'] ?? '');
            $counts[$slug] = ($counts[$slug] ?? 0) + 1;
        }
        foreach ($banks as &$bank) {
            $bank['count'] = $counts[(string) ($bank['subject_slug'] ?? '')] ?? 0;
        }
        unset($bank);
        return $banks;
    }

    public static function upsert(array $data, ?string $id = null): array
    {
        $row = [
            'subject_id' => $data['subject_id'] ?? null,
            'subject_name' => trim((string) ($data['subject_name'] ?? $data['subject'] ?? 'Общий')),
            'subject_slug' => trim((string) ($data['subject_slug'] ?? 'general')),
            'topic' => trim((string) ($data['topic'] ?? '')),
            'text' => trim((string) ($data['text'] ?? '')),
            'answer' => (string) ($data['answer'] ?? ''),
            'kind' => 'ticket',
            'type' => (string) ($data['type'] ?? 'open'),
            'for_exam' => true,
            'for_ticket' => true,
            'source' => (string) ($data['source'] ?? 'cms_supabase'),
            'is_published' => (bool) ($data['is_published'] ?? true),
        ];
        if ($row['text'] === '') throw new \InvalidArgumentException('text required');
        if ($id !== null && trim($id) !== '') $row['id'] = trim($id);
        $res = self::request('POST', 'exam_questions', $row, [
            'Prefer: return=representation,resolution=merge-duplicates',
        ]);
        return $res[0] ?? throw new \RuntimeException('No exam question returned');
    }

    public static function delete(string $id): bool
    {
        self::request('DELETE', 'exam_questions?id=eq.' . rawurlencode($id), null, ['Prefer: return=minimal']);
        return true;
    }

    public static function generate(string $bankId, int $count = 3, string $mode = 'practice'): array
    {
        $banks = self::request('GET', 'ticket_banks?id=eq.' . rawurlencode($bankId) . '&select=id,subject_name,subject_slug,title,mode');
        $bank = $banks[0] ?? null;
        if (!$bank) throw new \RuntimeException('Ticket bank not found');
        $pool = self::list(['subject_slug' => (string) ($bank['subject_slug'] ?? ''), 'kind' => 'ticket']);
        if (!$pool) throw new \RuntimeException('Ticket bank is empty');
        shuffle($pool);
        $picked = array_slice($pool, 0, max(1, min($count, count($pool))));
        if ($mode === 'exam') {
            foreach ($picked as &$item) {
                $item['has_answer'] = !empty($item['answer']);
                unset($item['answer']);
            }
            unset($item);
        }
        return [
            'bank' => [
                'id' => (string) $bank['id'],
                'title' => (string) ($bank['title'] ?? 'Билеты'),
                'subject' => (string) ($bank['subject_name'] ?? ''),
                'subject_slug' => (string) ($bank['subject_slug'] ?? ''),
            ],
            'questions' => array_values($picked),
            'count' => count($picked),
            'mode' => $mode,
            'generated_at' => gmdate('c'),
        ];
    }
}
