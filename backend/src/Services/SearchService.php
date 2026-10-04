<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\SupabaseRest;

final class SearchService
{
    public function search(string $query, int $limit = 30, ?string $subjectSlug = null, ?string $type = null): array
    {
        $query = trim($query);
        $limit = max(1, min(100, $limit));
        if ($query === '') {
            return ['query' => '', 'total' => 0, 'items' => [], 'facets' => ['subjects' => [], 'types' => []]];
        }

        $needle = mb_strtolower($query);
        $subjectSlug = $subjectSlug !== null && trim($subjectSlug) !== '' ? trim($subjectSlug) : null;
        $type = $type !== null && trim($type) !== '' ? trim($type) : null;

        $subjects = SupabaseRest::select(
            'subjects?is_active=eq.true&select=id,name,slug,description&order=name.asc&limit=500'
        );
        $subjectById = [];
        foreach ($subjects as $subject) {
            $subjectById[(string) ($subject['id'] ?? '')] = $subject;
        }
        $subjectAllowed = function (?string $slug) use ($subjectSlug): bool {
            return $subjectSlug === null || (string) $slug === $subjectSlug;
        };

        $hits = [];

        if ($type === null || $type === 'question') {
            $rows = SupabaseRest::select(
                'questions?is_published=eq.true&archived_at=is.null&select=id,subject_id,topic,text,answer&order=created_at.desc&limit=1000'
            );
            foreach ($rows as $row) {
                $subject = $subjectById[(string) ($row['subject_id'] ?? '')] ?? [];
                $slug = isset($subject['slug']) ? (string) $subject['slug'] : '';
                if (!$subjectAllowed($slug)) continue;
                $title = trim((string) ($row['text'] ?? ''));
                $topic = trim((string) ($row['topic'] ?? ''));
                $hay = mb_strtolower($title . ' ' . $topic);
                if (!str_contains($hay, $needle)) continue;
                $hits[] = $this->hit(
                    'q-' . (string) $row['id'],
                    mb_substr($title, 0, 140),
                    $title,
                    (string) ($subject['name'] ?? 'Без предмета'),
                    $slug,
                    $topic,
                    'question',
                    !empty($row['answer']),
                    $this->score($title, $topic, $needle),
                    $slug !== '' ? '/subjects/' . rawurlencode($slug) . '?tab=practice' : '/practice'
                );
            }
        }

        if ($type === null || $type === 'ticket') {
            $rows = SupabaseRest::select(
                'exam_questions?is_published=eq.true&select=id,subject_name,subject_slug,topic,text,answer&order=created_at.desc&limit=1000'
            );
            foreach ($rows as $row) {
                $slug = trim((string) ($row['subject_slug'] ?? ''));
                if (!$subjectAllowed($slug)) continue;
                $title = trim((string) ($row['text'] ?? ''));
                $topic = trim((string) ($row['topic'] ?? ''));
                $hay = mb_strtolower($title . ' ' . $topic . ' ' . (string) ($row['subject_name'] ?? ''));
                if (!str_contains($hay, $needle)) continue;
                $hits[] = $this->hit(
                    't-' . (string) $row['id'],
                    mb_substr($title, 0, 140),
                    $title,
                    (string) ($row['subject_name'] ?? 'Без предмета'),
                    $slug,
                    $topic,
                    'ticket',
                    !empty($row['answer']),
                    $this->score($title, $topic, $needle),
                    $slug !== '' ? '/subjects/' . rawurlencode($slug) . '?tab=tickets' : '/tickets'
                );
            }
        }

        if ($type === null || $type === 'trainer') {
            $rows = SupabaseRest::select(
                'trainer_feed_cards?is_published=eq.true&select=id,subject_slug,specialty_slug,preparation,question,tags&order=created_at.desc&limit=1000'
            );
            foreach ($rows as $row) {
                $slug = trim((string) ($row['subject_slug'] ?? ''));
                if (!$subjectAllowed($slug)) continue;
                if ($slug === 'histology' && (string) ($row['specialty_slug'] ?? 'mbh') !== 'mbh') continue;
                $prep = is_array($row['preparation'] ?? null) ? $row['preparation'] : [];
                $question = is_array($row['question'] ?? null) ? $row['question'] : [];
                $tags = is_array($row['tags'] ?? null) ? array_map('strval', $row['tags']) : [];
                $title = trim((string) ($prep['name'] ?? $question['prompt'] ?? 'Тренажёр'));
                $topic = implode(', ', $tags);
                $hay = mb_strtolower($title . ' ' . (string) ($question['prompt'] ?? '') . ' ' . $topic);
                if (!str_contains($hay, $needle)) continue;
                $subjectName = $slug === 'histology' ? 'Гистология, цитология' : ($slug ?: 'Тренажёр');
                $hits[] = $this->hit(
                    'r-' . (string) $row['id'],
                    $title,
                    trim((string) ($question['prompt'] ?? $title)),
                    $subjectName,
                    $slug,
                    $topic,
                    'trainer',
                    false,
                    $this->score($title, $topic, $needle),
                    $slug !== '' ? '/trainers/feed/' . rawurlencode($slug) : '/trainers'
                );
            }
        }

        if ($type === null || $type === 'subject') {
            foreach ($subjects as $subject) {
                $name = trim((string) ($subject['name'] ?? ''));
                $slug = trim((string) ($subject['slug'] ?? ''));
                if (!$subjectAllowed($slug)) continue;
                $hay = mb_strtolower($name . ' ' . (string) ($subject['description'] ?? ''));
                if (!str_contains($hay, $needle)) continue;
                $hits[] = $this->hit(
                    's-' . (string) $subject['id'],
                    $name,
                    (string) ($subject['description'] ?? $name),
                    $name,
                    $slug,
                    '',
                    'subject',
                    false,
                    $this->score($name, '', $needle) + 0.2,
                    '/subjects/' . rawurlencode((string) $subject['id'])
                );
            }
        }

        if ($type === null || $type === 'plan') {
            try {
                $plans = SupabaseRest::select('site_content?key=like.subject_plan:*&select=key,payload&limit=500');
                foreach ($plans as $row) {
                    $payload = is_array($row['payload'] ?? null) ? $row['payload'] : [];
                    $slug = trim((string) ($payload['subject_slug'] ?? preg_replace('/^subject_plan:/', '', (string) ($row['key'] ?? ''))));
                    if (!$subjectAllowed($slug)) continue;
                    $subjectName = trim((string) ($payload['subject'] ?? $slug));
                    $hay = mb_strtolower($subjectName . ' ' . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                    if (!str_contains($hay, $needle)) continue;
                    $hits[] = $this->hit(
                        'p-' . $slug,
                        $subjectName . ' · Учебный план',
                        'Учебный план предмета ' . $subjectName,
                        $subjectName,
                        $slug,
                        '',
                        'plan',
                        false,
                        $this->score($subjectName, '', $needle),
                        $slug !== '' ? '/subjects/' . rawurlencode($slug) . '?tab=plan' : '/subjects'
                    );
                }
            } catch (\Throwable $e) {
                // Search must remain usable even when plan documents are unavailable.
            }
        }

        usort($hits, static fn(array $a, array $b): int => ((float) $b['score'] <=> (float) $a['score']));
        $hits = array_slice($hits, 0, $limit);

        $subjectFacet = [];
        $typeFacet = [];
        foreach ($hits as $hit) {
            $slug = (string) $hit['subject_slug'];
            if ($slug !== '') {
                $subjectFacet[$slug] = ($subjectFacet[$slug] ?? ['subject' => $hit['subject'], 'subject_slug' => $slug, 'count' => 0]);
                $subjectFacet[$slug]['count']++;
            }
            $t = (string) $hit['type'];
            $typeFacet[$t] = ($typeFacet[$t] ?? 0) + 1;
        }

        return [
            'query' => $query,
            'total' => count($hits),
            'items' => $hits,
            'facets' => [
                'subjects' => array_values($subjectFacet),
                'types' => $typeFacet,
            ],
        ];
    }

    private function hit(string $id, string $title, string $snippet, string $subject, string $subjectSlug, string $topic, string $type, bool $hasAnswer, float $score, string $href): array
    {
        return [
            'id' => $id,
            'title' => $title,
            'snippet' => mb_substr(preg_replace('/\s+/u', ' ', $snippet) ?? $snippet, 0, 280),
            'subject' => $subject,
            'subject_slug' => $subjectSlug,
            'topic' => $topic,
            'type' => $type,
            'score' => round($score, 4),
            'has_answer' => $hasAnswer,
            'href' => $href,
        ];
    }

    private function score(string $title, string $topic, string $needle): float
    {
        $titleLower = mb_strtolower($title);
        $topicLower = mb_strtolower($topic);
        $score = 1.0;
        if ($titleLower === $needle) $score += 5;
        if (str_starts_with($titleLower, $needle)) $score += 2.5;
        if (str_contains($titleLower, $needle)) $score += 1.5;
        if ($topicLower !== '' && str_contains($topicLower, $needle)) $score += 0.8;
        return $score;
    }
}
