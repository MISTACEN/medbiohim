<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\ContentStore;
use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
use Medbiohim\Support\Str;

/** Generates lecture drafts from subject plan + knowledge base (+ optional LLM). RF media first. */
final class LectureGeneratorService
{
    private KnowledgeIndex $index;
    private ContentStore $store;

    public function __construct(?KnowledgeIndex $index = null, ?ContentStore $store = null)
    {
        $this->index = $index ?: new KnowledgeIndex();
        $this->store = $store ?: new ContentStore();
    }

    /** @return array<string,mixed> */
    public function generate(string $subjectSlug, string $topic, ?string $extraNotes = null): array
    {
        $subjectSlug = trim($subjectSlug);
        $topic = trim($topic);
        if ($subjectSlug === '' || $topic === '') {
            throw new \InvalidArgumentException('Укажите subject_slug и topic');
        }

        $plan = $this->store->getSubjectPlan($subjectSlug);
        $subjectName = is_array($plan) ? (string) ($plan['subject'] ?? $subjectSlug) : $subjectSlug;
        $planContext = $this->planContext($plan, $topic);

        $hits = $this->index->search($topic . ' ' . $subjectName, 8, $subjectSlug);
        $sources = [];
        $chunks = [];
        foreach ($hits as $hit) {
            $h = is_array($hit['chunk'] ?? null) ? $hit['chunk'] : $hit;
            $score = (float) ($hit['score'] ?? $h['score'] ?? 0);
            $sources[] = [
                'id' => (string) ($h['id'] ?? ''),
                'title' => (string) ($h['title'] ?? $h['topic'] ?? ''),
                'subject' => (string) ($h['subject'] ?? ''),
                'source' => (string) ($h['source'] ?? ''),
                'score' => $score,
                'excerpt' => Str::sub((string) ($h['text'] ?? $h['excerpt'] ?? ''), 0, 280),
            ];
            $chunks[] = Str::sub((string) ($h['text'] ?? $h['excerpt'] ?? ''), 0, 600);
        }

        $media = $this->buildMediaSuggestions($subjectName, $topic);
        $mode = 'template';
        $model = null;

        $llmKey = Env::get('LLM_API_KEY') ?: Env::get('OPENAI_API_KEY');
        if ($llmKey) {
            try {
                $body = $this->llmLecture($subjectName, $topic, $planContext, $chunks, $extraNotes, $llmKey);
                $mode = 'llm';
                $model = Env::get('LLM_MODEL', 'gpt-4o-mini');
            } catch (\Throwable $e) {
                $body = $this->templateLecture($subjectName, $topic, $planContext, $chunks, $extraNotes);
                $mode = 'template-fallback';
            }
        } else {
            $body = $this->templateLecture($subjectName, $topic, $planContext, $chunks, $extraNotes);
        }

        return [
            'title' => $this->makeTitle($subjectName, $topic),
            'subject' => $subjectName,
            'subject_slug' => $subjectSlug,
            'topic' => $topic,
            'body_md' => $body,
            'summary' => $this->makeSummary($body),
            'media' => $media,
            'sources' => $sources,
            'generation' => [
                'mode' => $mode,
                'model' => $model,
                'retrieved' => count($hits),
                'generated_at' => gmdate('c'),
                'notes' => $extraNotes,
            ],
        ];
    }

    private function planContext(?array $plan, string $topic): string
    {
        if (!is_array($plan)) {
            return '';
        }
        $lines = [];
        $weeks = is_array($plan['weeks'] ?? null) ? $plan['weeks'] : [];
        $needle = Str::lower($topic);
        foreach ($weeks as $w) {
            if (!is_array($w)) {
                continue;
            }
            $lec = (string) ($w['lecture'] ?? '');
            $pr = (string) ($w['practice'] ?? '');
            $blob = Str::lower($lec . ' ' . $pr);
            $lecShort = Str::lower(Str::sub($lec, 0, 40));
            if ($lec !== '' && (str_contains($blob, $needle) || ($lecShort !== '' && str_contains($needle, $lecShort)))) {
                $lines[] = 'Дата: ' . ($w['date'] ?? '') . '; Лекция: ' . $lec;
                if ($pr !== '') {
                    $lines[] = 'Практика: ' . $pr;
                }
                if (!empty($w['study']) && is_array($w['study'])) {
                    $lines[] = 'Изучать: ' . implode('; ', array_map('strval', $w['study']));
                }
                if (!empty($w['control'])) {
                    $lines[] = 'Контроль: ' . $w['control'];
                }
            }
        }
        if ($lines === [] && $weeks !== []) {
            foreach (array_slice($weeks, 0, 3) as $w) {
                if (!is_array($w)) {
                    continue;
                }
                $lines[] = trim(($w['date'] ?? '') . ' · ' . ($w['lecture'] ?? $w['practice'] ?? ''));
            }
        }
        return implode("\n", $lines);
    }

    /** @param list<string> $chunks */
    private function templateLecture(string $subject, string $topic, string $planContext, array $chunks, ?string $notes): string
    {
        $md = [];
        $md[] = '# ' . $topic;
        $md[] = '';
        $md[] = '> Предмет: **' . $subject . '**. Черновик для проверки администратором.';
        $md[] = '';
        $md[] = '## Цели занятия';
        $md[] = '- Понять ключевые понятия темы «' . $topic . '»';
        $md[] = '- Связать материал с учебным планом и типовыми вопросами';
        $md[] = '- Подготовиться к практике / контролю по теме';
        $md[] = '';
        if ($planContext !== '') {
            $md[] = '## По учебному плану';
            $md[] = $planContext;
            $md[] = '';
        }
        if ($notes) {
            $md[] = '## Указания';
            $md[] = $notes;
            $md[] = '';
        }
        $md[] = '## Основной материал';
        $md[] = '1. **Определение и контекст.** Тема «' . $topic . '» в курсе «' . $subject . '».';
        $md[] = '2. **Ключевые термины.** Определения, классификации, связи.';
        $md[] = '3. **Механизмы / логика.** Последовательность процессов или решение типовой задачи.';
        $md[] = '4. **Применение.** Клиническое или лабораторное значение.';
        $md[] = '';
        if ($chunks !== []) {
            $md[] = '## Фрагменты из базы знаний платформы';
            foreach (array_slice($chunks, 0, 5) as $i => $c) {
                $md[] = '### Источник ' . ($i + 1);
                $md[] = trim($c);
                $md[] = '';
            }
        }
        $md[] = '## Вопросы для самопроверки';
        $md[] = '1. Сформулируйте определение по теме «' . $topic . '».';
        $md[] = '2. Назовите 3–5 ключевых терминов.';
        $md[] = '3. Приведите пример применения материала.';
        $md[] = '';
        $md[] = '_Сгенерировано автоматически. Нужна проверка администратором._';
        return implode("\n", $md);
    }

    /** @param list<string> $chunks */
    private function llmLecture(string $subject, string $topic, string $planContext, array $chunks, ?string $notes, string $apiKey): string
    {
        $base = rtrim(Env::get('LLM_BASE_URL', 'https://api.openai.com/v1') ?? 'https://api.openai.com/v1', '/');
        $model = Env::get('LLM_MODEL', 'gpt-4o-mini') ?? 'gpt-4o-mini';
        $ctx = implode("\n---\n", array_slice($chunks, 0, 6));
        $system = 'Ты методист медвуза (медицинская биохимия). Пишешь лекцию на русском в Markdown для студентов 2 курса. Опирайся на учебный план и фрагменты базы. Не выдумывай официальные клинические рекомендации.';
        $user = "Предмет: {$subject}\nТема: {$topic}\n\nПлан:\n{$planContext}\n\nФрагменты базы:\n{$ctx}\n\n";
        if ($notes) {
            $user .= "Доп. указания: {$notes}\n";
        }
        $user .= 'Напиши лекцию (800–1500 слов) в Markdown: цели, материал, термины, самопроверка.';

        $payload = [
            'model' => $model,
            'temperature' => 0.4,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $user],
            ],
        ];
        $res = HttpClient::request('POST', $base . '/chat/completions', $payload, [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ], 60);
        $body = $res['body'] ?? [];
        if (!is_array($body)) {
            throw new \RuntimeException('LLM bad response');
        }
        $text = (string) ($body['choices'][0]['message']['content'] ?? '');
        if (trim($text) === '') {
            throw new \RuntimeException('LLM empty');
        }
        return trim($text);
    }

    /** @return list<array<string,mixed>> */
    private function buildMediaSuggestions(string $subject, string $topic): array
    {
        $q = rawurlencode($subject . ' ' . $topic);
        $qShort = rawurlencode($topic);
        $qSpace = rawurlencode($subject . ' ' . $topic);
        return [
            [
                'type' => 'rutube_search',
                'title' => 'RuTube — видео',
                'url' => 'https://rutube.ru/search/?query=' . $q,
                'query' => $subject . ' ' . $topic,
                'region' => 'ru',
                'note' => 'Работает без VPN',
            ],
            [
                'type' => 'vk_video_search',
                'title' => 'VK Видео',
                'url' => 'https://vk.com/video?q=' . $q,
                'query' => $subject . ' ' . $topic,
                'region' => 'ru',
                'note' => 'Работает без VPN',
            ],
            [
                'type' => 'yandex_video_search',
                'title' => 'Яндекс Видео',
                'url' => 'https://yandex.ru/video/search?text=' . $q,
                'query' => $subject . ' ' . $topic,
                'region' => 'ru',
                'note' => 'Работает без VPN',
            ],
            [
                'type' => 'dzen_search',
                'title' => 'Дзен — ролики и статьи',
                'url' => 'https://dzen.ru/search?query=' . $q,
                'query' => $subject . ' ' . $topic,
                'region' => 'ru',
            ],
            [
                'type' => 'youtube_search',
                'title' => 'YouTube (если доступен)',
                'url' => 'https://www.youtube.com/results?search_query=' . $q,
                'query' => $subject . ' ' . $topic,
                'region' => 'global',
                'note' => 'Может потребоваться VPN',
            ],
            [
                'type' => 'image_search',
                'title' => 'Яндекс Картинки — схемы',
                'url' => 'https://yandex.ru/images/search?text=' . $qSpace . rawurlencode(' схема'),
                'query' => $subject . ' ' . $topic . ' схема',
                'region' => 'ru',
                'note' => 'Проверяйте лицензию перед вставкой',
            ],
            [
                'type' => 'image_search',
                'title' => 'Wikimedia Commons',
                'url' => 'https://commons.wikimedia.org/w/index.php?search=' . $qShort . '&title=Special:MediaSearch&type=image',
                'query' => $topic,
                'region' => 'global',
            ],
        ];
    }

    private function makeTitle(string $subject, string $topic): string
    {
        $t = trim($topic);
        if (Str::len($t) > 120) {
            $t = Str::sub($t, 0, 117) . '…';
        }
        return $t . ' · ' . $subject;
    }

    private function makeSummary(string $body): string
    {
        $plain = preg_replace('/[#>*_`\[\]()]/', ' ', $body) ?? $body;
        $plain = preg_replace('/\s+/', ' ', $plain) ?? $plain;
        return Str::sub(trim($plain), 0, 220);
    }
}
