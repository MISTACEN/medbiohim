<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\ContentStore;
use Medbiohim\Support\Env;
use Medbiohim\Support\LlmGateway;
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
        $provider = null;

        try {
            $messages = [
                ['role' => 'system', 'content' => 'Ты методист медицинского вуза. Пиши учебную лекцию на русском для студентов. Опирайся только на переданный учебный план и фрагменты базы знаний. Не выдумывай официальные клинические рекомендации. Если данных недостаточно — прямо укажи это. Верни только Markdown лекции.'],
                ['role' => 'user', 'content' => $this->lecturePrompt($subjectName, $topic, $planContext, $chunks, $extraNotes)],
            ];
            $llm = LlmGateway::chat($messages, LlmGateway::TASK_LONG, 0.4);
            $body = trim((string)($llm['text'] ?? ''));
            if ($body === '') throw new \RuntimeException('LLM returned empty lecture');
            $mode = 'llm';
            $model = $llm['model'] ?? null;
            $provider = $llm['provider'] ?? null;
        } catch (\Throwable $e) {
            Logger::error('lecture_llm_failed', ['subject' => $subjectSlug, 'topic' => $topic, 'error' => $e->getMessage()]);
            $body = $this->templateLecture($subjectName, $topic, $planContext, $chunks, $extraNotes);
            $mode = 'template-fallback';
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
                'provider' => $provider,
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
    private function lecturePrompt(string $subject, string $topic, string $planContext, array $chunks, ?string $notes): string
    {
        $ctx = implode("\n---\n", array_slice($chunks, 0, 6));
        $user = "Предмет: {$subject}\nТема: {$topic}\n\nУчебный план:\n{$planContext}\n\nФрагменты базы знаний:\n{$ctx}\n\n";
        if ($notes) $user .= "Дополнительные указания: {$notes}\n\n";
        $user .= 'Составь полноценную лекцию 800–1500 слов: цели, ключевые термины, основная теория, механизмы/связи, практическое или клиническое значение только если подтверждается контекстом, краткий вывод и 5 вопросов для самопроверки.';
        return $user;
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
