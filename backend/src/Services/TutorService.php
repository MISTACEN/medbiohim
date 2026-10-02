<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\ContentStore;
use Medbiohim\Support\Env;
use Medbiohim\Support\LlmGateway;
use Medbiohim\Support\Str;

/**
 * AI-тьютор: lexical RAG по локальным банкам + LLM (Groq/GigaChat/Gemini).
 * Работает без обязательного Postgres для retrieval.
 */
final class TutorService
{
    public function meta(): array
    {
        $geo = \Medbiohim\Support\GeoRegion::detect();
        $providers = LlmGateway::chatProvidersStatus();
        $subjects = [
            ['slug' => 'histology', 'name' => 'Гистология, цитология'],
            ['slug' => 'organic_chemistry', 'name' => 'Органическая и физическая химия'],
            ['slug' => 'physiology', 'name' => 'Физиология'],
        ];
        return [
            'providers' => $providers,
            'subjects' => $subjects,
            'llm' => LlmGateway::status(),
            'mode' => 'rag+llm',
            'region' => $geo['region'],
            'country' => $geo['country'],
            'source' => $geo['source'],
        ];
    }

    /**
     * @param list<array{role:string,content:string}> $history
     * @return array<string,mixed>
     */
    public function ask(string $question, ?string $subjectSlug = null, array $history = [], int $topK = 6): array
    {
        $question = trim($question);
        if ($question === '') {
            throw new \InvalidArgumentException('Вопрос не может быть пустым');
        }
        if (mb_strlen($question) > 4000) {
            throw new \InvalidArgumentException('Вопрос слишком длинный');
        }
        $topK = max(1, min($topK, 12));
        $hits = $this->retrieve($question, $subjectSlug, $topK);
        $context = $this->formatContext($hits);

        $system = 'Ты — AI-тьютор платформы «Медбиохим» для студентов специальности МБХ. '
            . 'Отвечай по-русски, ясно и по делу. Опирайся на CONTEXT, если он есть; '
            . 'не выдумывай факты. Если в CONTEXT нет ответа — скажи об этом и дай общую учебную подсказку. '
            . 'Структура: кратко → механизм/логика → вывод.';
        if ($subjectSlug) {
            $system .= ' Предмет: ' . $subjectSlug . '.';
        }

        $messages = [['role' => 'system', 'content' => $system]];
        if ($context !== '') {
            $messages[] = ['role' => 'system', 'content' => "CONTEXT:\n" . $context];
        }
        foreach (array_slice($history, -6) as $h) {
            $messages[] = [
                'role' => ($h['role'] ?? '') === 'assistant' ? 'assistant' : 'user',
                'content' => Str::sub((string) ($h['content'] ?? ''), 0, 1200),
            ];
        }
        $messages[] = ['role' => 'user', 'content' => $question];

        $provider = strtolower((string) (Env::get('AI_CHAT_PRIMARY_PROVIDER', 'auto') ?? 'auto'));
        $llm = null;
        $error = null;
        try {
            $llm = LlmGateway::chatProvider($provider === '' ? 'auto' : $provider, $messages, 0.35);
        } catch (\Throwable $e) {
            $error = $e->getMessage();
            $llm = null;
        }

        if ($llm === null) {
            $answer = $this->templateAnswer($question, $hits);
            return [
                'answer' => $answer,
                'provider' => 'local-rag',
                'model' => null,
                'sources' => $hits,
                'llm_error' => $error,
            ];
        }

        return [
            'answer' => $llm['text'],
            'provider' => $llm['provider'],
            'model' => $llm['model'],
            'mode' => $llm['mode'] ?? null,
            'sources' => $hits,
        ];
    }

    /** @return list<array<string,mixed>> */
    private function retrieve(string $question, ?string $subjectSlug, int $topK): array
    {
        $store = new ContentStore();
        $pool = [];
        $slugs = $subjectSlug ? [$subjectSlug] : ['histology', 'organic_chemistry', 'physiology'];
        foreach ($slugs as $slug) {
            foreach ($store->listQuestionsBySubjectLocal($slug) as $row) {
                $text = (string) ($row['text'] ?? $row['q'] ?? $row['body'] ?? '');
                $ans = (string) ($row['answer'] ?? '');
                if ($text === '') continue;
                $pool[] = [
                    'subject_slug' => $slug,
                    'text' => $text,
                    'answer' => $ans,
                    'topic' => $row['topic'] ?? $row['module'] ?? null,
                    'id' => $row['id'] ?? null,
                ];
            }
        }
        foreach ($store->listTestsFromJsonFile() as $test) {
            if (!is_array($test)) continue;
            $title = (string) ($test['title'] ?? '');
            foreach (($test['questions'] ?? []) as $q) {
                if (!is_array($q)) continue;
                $text = (string) ($q['text'] ?? $q['q'] ?? $q['body'] ?? '');
                if ($text === '') continue;
                $pool[] = [
                    'subject_slug' => $subjectSlug,
                    'text' => $text,
                    'answer' => (string) ($q['answer'] ?? ''),
                    'topic' => $title,
                    'id' => $q['id'] ?? null,
                ];
            }
        }

        $tokens = $this->tokens($question);
        $scored = [];
        foreach ($pool as $item) {
            $hay = mb_strtolower($item['text'] . ' ' . $item['answer'] . ' ' . (string) ($item['topic'] ?? ''));
            $score = 0;
            foreach ($tokens as $tok) {
                if ($tok !== '' && str_contains($hay, $tok)) $score++;
            }
            if ($score > 0) {
                $item['score'] = $score;
                $scored[] = $item;
            }
        }
        usort($scored, static fn ($a, $b) => ($b['score'] ?? 0) <=> ($a['score'] ?? 0));
        return array_slice($scored, 0, $topK);
    }

    /** @param list<array<string,mixed>> $hits */
    private function formatContext(array $hits): string
    {
        $lines = [];
        foreach ($hits as $i => $h) {
            $n = $i + 1;
            $lines[] = "#{$n} [" . ($h['topic'] ?? $h['subject_slug'] ?? '') . "]\nQ: " . Str::sub((string) $h['text'], 0, 400)
                . "\nA: " . Str::sub((string) ($h['answer'] ?? '—'), 0, 400);
        }
        return implode("\n\n", $lines);
    }

    /** @param list<array<string,mixed>> $hits */
    private function templateAnswer(string $question, array $hits): string
    {
        if ($hits === []) {
            return "Пока не нашёл близких фрагментов в локальной базе. Уточни предмет или формулировку. (LLM сейчас недоступен — проверь ключи провайдеров на сервере.)";
        }
        $parts = ["По материалам базы (без LLM):\n"];
        foreach (array_slice($hits, 0, 3) as $i => $h) {
            $parts[] = ($i + 1) . ') ' . Str::sub((string) $h['text'], 0, 200);
            if (!empty($h['answer'])) {
                $parts[] = '   → ' . Str::sub((string) $h['answer'], 0, 250);
            }
        }
        return implode("\n", $parts);
    }

    /** @return list<string> */
    private function tokens(string $q): array
    {
        $q = mb_strtolower($q);
        $q = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $q) ?? $q;
        $parts = preg_split('/\s+/u', $q) ?: [];
        $out = [];
        foreach ($parts as $p) {
            if (mb_strlen($p) >= 3) $out[] = $p;
        }
        return array_values(array_unique($out));
    }
}
