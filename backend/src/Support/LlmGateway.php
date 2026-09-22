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
    /** Explicit provider used by the persistent AI chat. */
    public static function chatProvider(string $provider, array $messages, float $temperature = 0.4): array
    {
        $provider = strtolower(trim($provider));
        if ($provider === 'auto') {
            $preferred = strtolower((string)(Env::get('AI_CHAT_PRIMARY_PROVIDER', 'groq') ?? 'groq'));
            $chain = array_values(array_unique([$preferred, 'groq', 'gigachat', 'gemini']));
            $errors = [];
            foreach ($chain as $p) {
                try { return self::chatProvider($p, $messages, $temperature); }
                catch (\Throwable $e) { $errors[] = $p . ': ' . Str::sub($e->getMessage(), 0, 160); }
            }
            throw new \RuntimeException('AI providers unavailable: ' . implode(' | ', $errors));
        }
        if ($provider === 'gigachat' || $provider === 'giga') {
            return self::chatGigaChat($messages, $temperature);
        }
        if ($provider === 'groq') {
            return self::chatGroq($messages, $temperature);
        }
        if ($provider === 'gemini' || $provider === 'google') {
            return self::chatGemini($messages, $temperature);
        }
        throw new \InvalidArgumentException('Unknown AI provider: ' . $provider);
    }

    public static function chatProvidersStatus(): array
    {
        return [
            'groq' => [
                'configured' => (bool)Env::get('GROQ_API_KEY'),
                'model' => Env::get('GROQ_MODEL', 'openai/gpt-oss-20b'),
            ],
            'gigachat' => [
                'configured' => (bool)(Env::get('GIGACHAT_CREDENTIALS') || Env::get('GIGACHAT_ACCESS_TOKEN') || Env::get('LLM_PRIMARY_API_KEY')),
                'model' => Env::get('GIGACHAT_MODEL', 'GigaChat'),
            ],
            'gemini' => [
                'configured' => (bool)Env::get('GEMINI_API_KEY'),
                'model' => Env::get('GEMINI_MODEL', 'gemini-3.5-flash'),
            ],
            'default' => Env::get('AI_CHAT_PRIMARY_PROVIDER', 'groq'),
        ];
    }

    private static function chatGroq(array $messages, float $temperature): array
    {
        $key = trim((string)(Env::get('GROQ_API_KEY', '') ?? ''));
        if ($key === '') throw new \RuntimeException('GROQ_API_KEY is not configured');
        $base = rtrim((string)(Env::get('GROQ_BASE_URL', 'https://api.groq.com/openai/v1') ?? 'https://api.groq.com/openai/v1'), '/');
        $model = (string)(Env::get('GROQ_MODEL', 'openai/gpt-oss-20b') ?? 'openai/gpt-oss-20b');
        $payload = ['model' => $model, 'temperature' => $temperature, 'messages' => $messages];
        $res = HttpClient::request('POST', $base . '/chat/completions', $payload, [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ], 90);
        if (($res['status'] ?? 0) < 200 || ($res['status'] ?? 0) >= 300) {
            throw new \RuntimeException('Groq HTTP ' . (int)($res['status'] ?? 0) . ': ' . Str::sub((string)($res['body'] ?? ''), 0, 300));
        }
        $body = $res['json'] ?? [];
        $text = (string)($body['choices'][0]['message']['content'] ?? '');
        if (trim($text) === '') throw new \RuntimeException('Groq returned empty content');
        return ['text' => trim($text), 'provider' => 'groq', 'model' => $model, 'mode' => 'api'];
    }

    private static function chatGigaChat(array $messages, float $temperature): array
    {
        $base = rtrim((string)(Env::get('GIGACHAT_BASE_URL', 'https://api.giga.chat/v1') ?? 'https://api.giga.chat/v1'), '/');
        $model = (string)(Env::get('GIGACHAT_MODEL', 'GigaChat') ?? 'GigaChat');
        $token = trim((string)(Env::get('GIGACHAT_ACCESS_TOKEN', '') ?? ''));
        if ($token === '') $token = self::gigaAccessToken();
        $payload = ['model'=>$model,'temperature'=>$temperature,'messages'=>$messages];
        $res = HttpClient::request('POST', $base . '/chat/completions', $payload, [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
        ], 90);
        if (($res['status'] ?? 0) < 200 || ($res['status'] ?? 0) >= 300) {
            throw new \RuntimeException('GigaChat HTTP ' . (int)($res['status'] ?? 0) . ': ' . Str::sub((string)($res['body'] ?? ''),0,300));
        }
        $body=$res['json'] ?? [];
        $text=(string)($body['choices'][0]['message']['content'] ?? '');
        if (trim($text)==='') throw new \RuntimeException('GigaChat returned empty content');
        return ['text'=>trim($text),'provider'=>'gigachat','model'=>$model,'mode'=>'api'];
    }

    private static function gigaAccessToken(): string
    {
        $credential = trim((string)(Env::get('GIGACHAT_CREDENTIALS') ?: Env::get('GIGACHAT_AUTH_KEY') ?: Env::get('LLM_PRIMARY_API_KEY') ?: ''));
        if ($credential === '') throw new \RuntimeException('GigaChat credentials are not configured');
        $scope = (string)(Env::get('GIGACHAT_SCOPE', 'GIGACHAT_API_PERS') ?? 'GIGACHAT_API_PERS');
        $cache = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'medbiohim_gigachat_' . sha1($credential) . '.json';
        if (is_readable($cache)) {
            $cached=json_decode((string)@file_get_contents($cache),true);
            if (is_array($cached) && !empty($cached['access_token']) && (int)($cached['expires_at'] ?? 0) > time()+60) return (string)$cached['access_token'];
        }
        $rquid = self::uuid4();
        $res = HttpClient::form('POST', 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth', ['scope'=>$scope], [
            'RqUID: ' . $rquid,
            'Authorization: Basic ' . $credential,
        ], 20);
        if (($res['status'] ?? 0) < 200 || ($res['status'] ?? 0) >= 300) {
            throw new \RuntimeException('GigaChat OAuth HTTP ' . (int)($res['status'] ?? 0) . ': ' . Str::sub((string)($res['body'] ?? ''),0,300));
        }
        $body=$res['json'] ?? [];
        $token=(string)($body['access_token'] ?? '');
        if ($token==='') throw new \RuntimeException('GigaChat OAuth returned no access_token');
        @file_put_contents($cache,json_encode(['access_token'=>$token,'expires_at'=>(int)($body['expires_at'] ?? time()+1500)]),LOCK_EX);
        return $token;
    }

    private static function chatGemini(array $messages, float $temperature): array
    {
        $key=trim((string)(Env::get('GEMINI_API_KEY','') ?? ''));
        if($key==='') throw new \RuntimeException('GEMINI_API_KEY is not configured');
        $base=rtrim((string)(Env::get('GEMINI_BASE_URL','https://generativelanguage.googleapis.com/v1beta') ?? 'https://generativelanguage.googleapis.com/v1beta'),'/');
        $model=(string)(Env::get('GEMINI_MODEL','gemini-3.5-flash') ?? 'gemini-3.5-flash');
        $system='';
        $contents=[];
        foreach($messages as $m){
            $role=(string)($m['role']??'user'); $content=$m['content']??'';
            if($role==='system'){ $system.=(($system?'\n':'').(string)$content); continue; }
            $contents[]=['role'=>$role==='assistant'?'model':'user','parts'=>[['text'=>(string)$content]]];
        }
        if(!$contents) throw new \InvalidArgumentException('At least one user message is required');
        $payload=['contents'=>$contents,'generationConfig'=>['temperature'=>$temperature,'maxOutputTokens'=>(int)(Env::get('GEMINI_MAX_OUTPUT_TOKENS','2048')??2048)]];
        if($system!=='') $payload['systemInstruction']=['parts'=>[['text'=>$system]]];
        $res=HttpClient::request('POST',$base.'/models/'.rawurlencode($model).':generateContent',$payload,['x-goog-api-key: '.$key,'Content-Type: application/json'],90);
        if(($res['status']??0)<200||($res['status']??0)>=300) throw new \RuntimeException('Gemini HTTP '.(int)($res['status']??0).': '.Str::sub((string)($res['body']??''),0,300));
        $body=$res['json']??[]; $parts=$body['candidates'][0]['content']['parts']??[]; $text='';
        foreach($parts as $p) if(is_array($p)&&isset($p['text'])) $text.=(string)$p['text'];
        if(trim($text)==='') throw new \RuntimeException('Gemini returned empty content');
        return ['text'=>trim($text),'provider'=>'gemini','model'=>$model,'mode'=>'api'];
    }

    private static function uuid4(): string
    {
        $d=random_bytes(16); $d[6]=chr((ord($d[6])&0x0f)|0x40); $d[8]=chr((ord($d[8])&0x3f)|0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s',str_split(bin2hex($d),4));
    }

}
