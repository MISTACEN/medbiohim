<?php
declare(strict_types=1);

namespace Medbiohim\Services;

/**
 * Unified question bank over ContentStore JSON (works without Postgres).
 * All curated legacy questions are exam ticket questions (kind=ticket).
 */
final class QuestionBank
{
    private string $dir;

    public function __construct(?string $dir = null)
    {
        $this->dir = $dir ?: dirname(__DIR__, 2) . '/data';
    }

    /** @return list<array<string,mixed>> */
    public function allQuestions(): array
    {
        $d = $this->read('questions_bank.json');
        $items = $d['items'] ?? [];
        return is_array($items) ? $items : [];
    }

    /** @return list<array<string,mixed>> */
    public function listQuestions(array $filters = []): array
    {
        $items = $this->allQuestions();
        $subject = isset($filters['subject']) ? mb_strtolower((string) $filters['subject']) : '';
        $slug = isset($filters['subject_slug']) ? (string) $filters['subject_slug'] : '';
        $kind = isset($filters['kind']) ? (string) $filters['kind'] : '';
        $type = isset($filters['type']) ? (string) $filters['type'] : '';
        $q = isset($filters['q']) ? mb_strtolower(trim((string) $filters['q'])) : '';
        $topic = isset($filters['topic']) ? mb_strtolower((string) $filters['topic']) : '';

        $out = [];
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            if ($slug !== '' && (string) ($item['subject_slug'] ?? '') !== $slug) continue;
            if ($subject !== '' && !str_contains(mb_strtolower((string) ($item['subject'] ?? '')), $subject)) continue;
            if ($kind !== '' && (string) ($item['kind'] ?? '') !== $kind) continue;
            if ($type !== '' && (string) ($item['type'] ?? '') !== $type) continue;
            if ($topic !== '' && !str_contains(mb_strtolower((string) ($item['topic'] ?? '')), $topic)) continue;
            if ($q !== '') {
                $hay = mb_strtolower((string) ($item['text'] ?? '') . ' ' . (string) ($item['topic'] ?? ''));
                if (!str_contains($hay, $q)) continue;
            }
            $out[] = $item;
        }
        return $out;
    }

    public function getQuestion(string $id): ?array
    {
        foreach ($this->allQuestions() as $item) {
            if ((string) ($item['id'] ?? '') === $id) return $item;
        }
        return null;
    }

    public function ticketBanks(): array
    {
        $d = $this->read('tickets_bank.json');
        $items = $d['items'] ?? [];
        if (!is_array($items)) return [];
        $out = [];
        foreach ($items as $b) {
            if (!is_array($b)) continue;
            $qs = $b['questions'] ?? [];
            $ids = $b['question_ids'] ?? [];
            $count = is_array($qs) && $qs !== [] ? count($qs) : (is_array($ids) ? count($ids) : (int) ($b['count'] ?? 0));
            $out[] = [
                'id' => (string) ($b['id'] ?? ''),
                'title' => (string) ($b['title'] ?? 'Билеты'),
                'subject' => (string) ($b['subject'] ?? ''),
                'subject_slug' => (string) ($b['subject_slug'] ?? ''),
                'count' => $count,
                'mode' => (string) ($b['mode'] ?? 'exam'),
            ];
        }
        return $out;
    }

    public function generateTicket(string $bankId, int $count = 3, string $mode = 'exam'): array
    {
        $raw = null;
        $d = $this->read('tickets_bank.json');
        foreach (($d['items'] ?? []) as $b) {
            if (is_array($b) && (string) ($b['id'] ?? '') === $bankId) { $raw = $b; break; }
        }
        if ($raw === null) throw new \RuntimeException('Ticket bank not found');

        $pool = [];
        if (!empty($raw['questions']) && is_array($raw['questions'])) {
            foreach ($raw['questions'] as $q) {
                if (!is_array($q)) continue;
                $text = (string) ($q['text'] ?? '');
                if ($text === '') continue;
                $id = (string) ($q['id'] ?? '');
                $full = $id !== '' ? $this->getQuestion($id) : null;
                $pool[] = $full ?? [
                    'id' => $id !== '' ? $id : ('tmp-' . substr(sha1($text), 0, 10)),
                    'text' => $text,
                    'answer' => (string) ($q['answer'] ?? ''),
                    'topic' => (string) ($q['topic'] ?? ''),
                    'subject' => (string) ($raw['subject'] ?? ''),
                    'subject_slug' => (string) ($raw['subject_slug'] ?? ''),
                    'kind' => 'ticket',
                    'type' => 'open',
                    'for_exam' => true,
                    'for_ticket' => true,
                ];
            }
        } elseif (!empty($raw['question_ids']) && is_array($raw['question_ids'])) {
            foreach ($raw['question_ids'] as $id) {
                $q = $this->getQuestion((string) $id);
                if ($q !== null) $pool[] = $q;
            }
        }
        if ($pool === []) throw new \RuntimeException('Ticket bank is empty');

        shuffle($pool);
        $picked = array_slice($pool, 0, max(1, min($count, count($pool))));
        if ($mode === 'exam') {
            $picked = array_map(static function (array $q): array {
                $q['has_answer'] = !empty($q['answer']);
                unset($q['answer']);
                return $q;
            }, $picked);
        }

        return [
            'bank' => [
                'id' => (string) ($raw['id'] ?? ''),
                'title' => (string) ($raw['title'] ?? ''),
                'subject' => (string) ($raw['subject'] ?? ''),
                'subject_slug' => (string) ($raw['subject_slug'] ?? ''),
            ],
            'questions' => array_values($picked),
            'count' => count($picked),
            'mode' => $mode,
            'generated_at' => gmdate('c'),
        ];
    }

    public function trainers(): array
    {
        $d = $this->read('trainers_bank.json');
        $items = $d['items'] ?? [];
        return is_array($items) ? $items : [];
    }

    public function getTrainer(string $id): ?array
    {
        foreach ($this->trainers() as $t) {
            if ((string) ($t['id'] ?? '') === $id) return $t;
        }
        return null;
    }

    public function subjectsSummary(): array
    {
        $map = [];
        foreach ($this->allQuestions() as $q) {
            $slug = (string) ($q['subject_slug'] ?? 'other');
            if (!isset($map[$slug])) {
                $map[$slug] = [
                    'subject' => (string) ($q['subject'] ?? $slug),
                    'subject_slug' => $slug,
                    'count' => 0,
                    'kinds' => [],
                ];
            }
            $map[$slug]['count']++;
            $k = (string) ($q['kind'] ?? 'ticket');
            $map[$slug]['kinds'][$k] = ($map[$slug]['kinds'][$k] ?? 0) + 1;
        }
        return array_values($map);
    }

    private function read(string $file): array
    {
        $p = $this->dir . '/' . $file;
        if (!is_file($p)) return [];
        $raw = file_get_contents($p);
        if ($raw === false || trim($raw) === '') return [];
        $v = json_decode($raw, true);
        return is_array($v) ? $v : [];
    }
}
