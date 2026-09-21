<?php
declare(strict_types=1);

namespace Medbiohim\Support;

/**
 * Multi-provider LLM router:
 * - SpaceWeb: RAG/templates only (no heavy models)
 * - PRIMARY: RF-reachable API (VPS RU / Yandex / GigaChat / Ollama)
 * - GLOBAL: OpenAI etc. (optional fallback)
 */
final class LlmGateway
{
    public const TASK_CHAT = 'chat';
    public const TASK_VISION = 'vision';
    public const TASK_LONG = 'long';

    /** @param list<array{role:string,content:mixed}> $messages @return array{text:string,provider:string,model:string,mode:string} */
    public static function chat(array $messages, string $task = self::TASK_CHAT, float $temperature = 0.4): array
    {
        $mode = strtolower((string) (Env::get('LLM_MODE', 'hybrid') ?? 'hybrid'));
        $chain = self::providerChain($task, $mode);
        $errors = [];
        foreach ($chain as $provider) {
            $cfg = self::configFor($provider);
            if ($cfg === null) continue;
            try {
                $text = self::requestChat($cfg, $messages, $temperature);
                return ['text' => $text, 'provider' => $provider, 'model' => $cfg['model'], 'mode' => $mode];
            } catch (\Throwable $e) {
                $errors[] = $provider . ': ' . Str::sub($e->getMessage(), 0, 120);
                Logger::error('llm_provider_failed', ['provider' => $provider, 'task' => $task, 'error' => $e->getMessage()]);
            }
        }
        throw new \RuntimeException($errors === []
            ? 'LLM не настроен (local-only). Задайте PRIMARY или GLOBAL.'
            : 'Все LLM-провайдеры недоступны: ' . implode(' | ', $errors));
    }

    public static function chatOrNull(array $messages, string $task = self::TASK_CHAT, float $temperature = 0.4): ?array
    {
        try { return self::chat($messages, $task, $temperature); }
        catch (\Throwable $e) { return null; }
    }

    /** @return array<string,mixed> */
    public static function status(): array
    {
        $mode = strtolower((string) (Env::get('LLM_MODE', 'hybrid') ?? 'hybrid'));
        $primary = self::configFor('primary');
        $global = self::configFor('global');
        return [
            'mode' => $mode,
            'spaceweb_local' => ['rag' => true, 'templates' => true, 'heavy_models' => false, 'note' => 'SpaceWeb: lexical RAG + templates only'],
            'primary' => ['configured' => $primary !== null, 'base_url' => $primary['base'] ?? null, 'model' => $primary['model'] ?? null, 'region_hint' => 'RF-reachable'],
            'global' => ['configured' => $global !== null, 'allowed' => self::allowGlobal(), 'base_url' => $global['base'] ?? null, 'model' => $global['model'] ?? null, 'region_hint' => 'optional fallback'],
            'vision_provider' => Env::get('LLM_VISION_PROVIDER', 'auto'),
            'media_policy' => Env::get('MEDIA_REGION_DEFAULT', 'ru'),
        ];
    }

    /** @return list<string> */
    private static function providerChain(string $task, string $mode): array
    {
        if ($mode === 'local') return [];
        if ($mode === 'primary') return ['primary'];
        if ($mode === 'global') return self::allowGlobal() ? ['global'] : [];
        $visionPref = strtolower((string) (Env::get('LLM_VISION_PROVIDER', 'auto') ?? 'auto'));
        if ($task === self::TASK_VISION) {
            if ($visionPref === 'primary') return self::allowGlobal() ? ['primary', 'global'] : ['primary'];
            if ($visionPref === 'global') return self::allowGlobal() ? ['global', 'primary'] : ['primary'];
            return self::allowGlobal() ? ['primary', 'global'] : ['primary'];
        }
        return self::allowGlobal() ? ['primary', 'global'] : ['primary'];
    }

    private static function allowGlobal(): bool
    {
        $v = Env::get('LLM_ALLOW_GLOBAL', '1');
        return $v === null || $v === '' || $v === '1' || strtolower($v) === 'true';
    }

    /** @return array{base:string,key:string,model:string}|null */
    private static function configFor(string $provider): ?array
    {
        if ($provider === 'primary') {
            $base = Env::get('LLM_PRIMARY_BASE_URL') ?: Env::get('LLM_BASE_URL');
            $key = Env::get('LLM_PRIMARY_API_KEY') ?: Env::get('LLM_API_KEY') ?: Env::get('OPENAI_API_KEY');
            $model = Env::get('LLM_PRIMARY_MODEL') ?: Env::get('LLM_MODEL', 'gpt-4o-mini');
            if (!$base && $key) $base = 'https://api.openai.com/v1';
            if (!$base || !$key) return null;
            return ['base' => rtrim($base, '/'), 'key' => $key, 'model' => $model ?: 'gpt-4o-mini'];
        }
        if ($provider === 'global') {
            $base = Env::get('LLM_GLOBAL_BASE_URL') ?: null;
            $key = Env::get('LLM_GLOBAL_API_KEY') ?: null;
            $model = Env::get('LLM_GLOBAL_MODEL') ?: Env::get('LLM_MODEL', 'gpt-4o-mini');
            if (!$key && !$base) {
                $legacyBase = Env::get('LLM_BASE_URL');
                $legacyKey = Env::get('LLM_API_KEY') ?: Env::get('OPENAI_API_KEY');
                $primaryBase = Env::get('LLM_PRIMARY_BASE_URL');
                if ($legacyKey && $legacyBase && $primaryBase && rtrim($legacyBase, '/') !== rtrim($primaryBase, '/')) {
                    $base = $legacyBase; $key = $legacyKey;
                }
            }
            if (!$base || !$key) return null;
            return ['base' => rtrim($base, '/'), 'key' => $key, 'model' => $model ?: 'gpt-4o-mini'];
        }
        return null;
    }

    /** @param array{base:string,key:string,model:string} $cfg @param list<array{role:string,content:mixed}> $messages */
    private static function requestChat(array $cfg, array $messages, float $temperature): string
    {
        $timeout = (int) (Env::get('LLM_TIMEOUT_SEC', '60') ?? '60');
        if ($timeout < 15) $timeout = 15;
        if ($timeout > 120) $timeout = 120;
        $payload = ['model' => $cfg['model'], 'temperature' => $temperature, 'messages' => $messages];
        $res = HttpClient::request('POST', $cfg['base'] . '/chat/completions', $payload, [
            'Authorization: Bearer ' . $cfg['key'],
            'Content-Type: application/json',
        ], $timeout);
        $body = $res['body'] ?? null;
        if (!is_array($body)) throw new \RuntimeException('Non-JSON LLM response HTTP ' . (int) ($res['status'] ?? 0));
        if (!empty($body['error'])) {
            $err = is_array($body['error']) ? ($body['error']['message'] ?? json_encode($body['error'])) : (string) $body['error'];
            throw new \RuntimeException('LLM error: ' . Str::sub((string) $err, 0, 200));
        }
        $text = (string) ($body['choices'][0]['message']['content'] ?? '');
        if (trim($text) === '') throw new \RuntimeException('Empty LLM content');
        return trim($text);
    }
}
