<?php
declare(strict_types=1);

namespace Medbiohim\Services;

/**
 * Unified question bank over ContentStore JSON (works without Postgres).
 * Source: curated legacy migration → data/questions_bank.json etc.
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
            if (!is_array($item)) {
                continue;
            }
            if ($slug !== '' && (string) ($item['subject_slug'] ?? '') !== $slug) {
                continue;
            }
            if ($subject !== '' && !str_contains(mb_strtolower((string) ($item['subject'] ?? '')), $subject)) {
                continue;
            }
            if ($kind !== '' && (string) ($item['kind'] ?? '') !== $kind) {
                continue;
            }
            if ($type !== '' && (string) ($item['type'] ?? '') !== $type) {
                continue;
            }
            if ($topic !== '' && !str_contains(mb_strtolower((string) ($item['topic'] ?? '')), $topic)) {
                continue;
            }
            if ($q !== '') {
                $hay = mb_strtolower((string) ($item['text'] ?? '') . ' ' . (string) ($item['topic'] ?? ''));
                if (!str_contains($hay, $q)) {
                    continue;
                }
            }
            $out[] = $item;
        }
        return $out;
    }

    public function getQuestion(string $id): ?array
    {
        foreach ($this->allQuestions() as $item) {
            if ((string) ($item['id'] ?? '') === $id) {
                return $item;
            }
        }
        return null;
    }

    /** @return list<array<string,mixed>> */
    public function ticketBanks(): array
    {
        $d = $this->read('tickets_bank.json');
        $items = $d['items'] ?? [];
        return is_array($items) ? $items : [];
    }

    /**
     * Generate a random ticket: N open questions from a ticket bank.
     * @return array{bank:array,questions:list<array>}
     */
    public function generateTicket(string $bankId, int $count = 3): array
    {
        $bank = null;
        foreach ($this->ticketBanks() as $b) {
            if ((string) ($b['id'] ?? '') === $bankId) {
                $bank = $b;
                break;
            }
        }
        if ($bank === null) {
            throw new \RuntimeException('Ticket bank not found');
        }
        $ids = $bank['question_ids'] ?? [];
        if (!is_array($ids) || $ids === []) {
            throw new \RuntimeException('Ticket bank is empty');
        }
        shuffle($ids);
        $ids = array_slice($ids, 0, max(1, min($count, count($ids))));
        $questions = [];
        foreach ($ids as $id) {
            $q = $this->getQuestion((string) $id);
            if ($q !== null) {
                $questions[] = $q;
            }
        }
        return [
            'bank' => [
                'id' => $bank['id'],
                'title' => $bank['title'] ?? '',
                'subject' => $bank['subject'] ?? '',
            ],
            'questions' => $questions,
            'count' => count($questions),
            'generated_at' => gmdate('c'),
        ];
    }

    /** @return list<array<string,mixed>> */
    public function trainers(): array
    {
        $d = $this->read('trainers_bank.json');
        $items = $d['items'] ?? [];
        return is_array($items) ? $items : [];
    }

    public function getTrainer(string $id): ?array
    {
        foreach ($this->trainers() as $t) {
            if ((string) ($t['id'] ?? '') === $id) {
                return $t;
            }
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
            $k = (string) ($q['kind'] ?? 'main');
            $map[$slug]['kinds'][$k] = ($map[$slug]['kinds'][$k] ?? 0) + 1;
        }
        return array_values($map);
    }

    /** @return array<string,mixed> */
    private function read(string $file): array
    {
        $p = $this->dir . '/' . $file;
        if (!is_file($p)) {
            return [];
        }
        $raw = file_get_contents($p);
        if ($raw === false || trim($raw) === '') {
            return [];
        }
        $v = json_decode($raw, true);
        return is_array($v) ? $v : [];
    }
}
