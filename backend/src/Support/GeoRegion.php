<?php
declare(strict_types=1);

namespace Medbiohim\Support;

/**
 * Определяет регион клиента на каждый запрос (VPN/смена сети).
 * RU/RF → провайдеры, доступные из РФ; иначе — полный набор.
 */
final class GeoRegion
{
    public const REGION_RU = 'ru';
    public const REGION_GLOBAL = 'global';

    /**
     * @param array<string,string|list<string>> $server typically $_SERVER
     * @return array{region:string,country:string|null,source:string}
     */
    public static function detect(array $server = []): array
    {
        if ($server === []) {
            $server = $_SERVER;
        }

        $headerKeys = [
            'HTTP_CF_IPCOUNTRY',
            'HTTP_X_VERCEL_IP_COUNTRY',
            'HTTP_X_COUNTRY_CODE',
            'HTTP_CLOUDFRONT_VIEWER_COUNTRY',
            'HTTP_X_APPENGINE_COUNTRY',
        ];
        foreach ($headerKeys as $hk) {
            $v = self::header($server, $hk);
            if ($v !== null && $v !== '' && strtoupper($v) !== 'XX') {
                $cc = strtoupper($v);
                return [
                    'region' => self::isRu($cc) ? self::REGION_RU : self::REGION_GLOBAL,
                    'country' => $cc,
                    'source' => $hk,
                ];
            }
        }

        $forced = Env::get('GEO_FORCE_REGION');
        if ($forced !== null && $forced !== '') {
            $f = strtolower(trim($forced));
            if (in_array($f, [self::REGION_RU, 'rf', 'russia'], true)) {
                return ['region' => self::REGION_RU, 'country' => 'RU', 'source' => 'env'];
            }
            if ($f === self::REGION_GLOBAL || $f === 'world') {
                return ['region' => self::REGION_GLOBAL, 'country' => null, 'source' => 'env'];
            }
        }

        if (self::truthy(Env::get('GEO_IP_LOOKUP', '0'))) {
            $ip = self::clientIp($server);
            if ($ip !== null && !self::isPrivateIp($ip)) {
                $looked = self::lookupIp($ip);
                if ($looked !== null) {
                    return $looked;
                }
            }
        }

        $lang = self::header($server, 'HTTP_ACCEPT_LANGUAGE') ?? '';
        if (preg_match('/\bru\b/i', $lang) && !preg_match('/\ben\b/i', $lang)) {
            return ['region' => self::REGION_RU, 'country' => null, 'source' => 'accept-language'];
        }

        return ['region' => self::REGION_GLOBAL, 'country' => null, 'source' => 'default'];
    }

    public static function isRuCountry(?string $cc): bool
    {
        return self::isRu((string) $cc);
    }

    public static function ruPreferredProviders(): array
    {
        return ['gigachat', 'yandex', 'local'];
    }

    public static function providerChain(string $region, string $preferred = 'auto'): array
    {
        $preferred = strtolower(trim($preferred));
        if ($region === self::REGION_RU) {
            $chain = ['gigachat', 'groq', 'gemini', 'mistral', 'openrouter'];
        } else {
            $chain = ['groq', 'gemini', 'mistral', 'openrouter', 'gigachat'];
        }
        if ($preferred !== '' && $preferred !== 'auto' && in_array($preferred, $chain, true)) {
            $chain = array_values(array_unique(array_merge([$preferred], $chain)));
        }
        return $chain;
    }

    private static function isRu(string $cc): bool
    {
        $cc = strtoupper(trim($cc));
        return in_array($cc, ['RU', 'RF', 'SU'], true);
    }

    private static function header(array $server, string $key): ?string
    {
        $v = $server[$key] ?? null;
        if (is_array($v)) $v = $v[0] ?? null;
        if (!is_string($v)) return null;
        $v = trim($v);
        return $v === '' ? null : $v;
    }

    private static function clientIp(array $server): ?string
    {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $k) {
            $v = self::header($server, $k);
            if ($v === null) continue;
            if (str_contains($v, ',')) {
                $v = trim(explode(',', $v)[0]);
            }
            if (filter_var($v, FILTER_VALIDATE_IP)) return $v;
        }
        return null;
    }

    private static function isPrivateIp(string $ip): bool
    {
        return !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    }

    /** @return array{region:string,country:string|null,source:string}|null */
    private static function lookupIp(string $ip): ?array
    {
        try {
            $url = 'https://ipapi.co/' . rawurlencode($ip) . '/country_code/';
            $res = HttpClient::request('GET', $url, null, ['User-Agent: medbiohim-geo/1'], 3);
            $cc = strtoupper(trim((string) ($res['body'] ?? '')));
            if (strlen($cc) === 2 && ctype_alpha($cc)) {
                return [
                    'region' => self::isRu($cc) ? self::REGION_RU : self::REGION_GLOBAL,
                    'country' => $cc,
                    'source' => 'ipapi',
                ];
            }
        } catch (\Throwable $e) {
            Logger::error('geo_ip_lookup_failed', ['error' => $e->getMessage()]);
        }
        return null;
    }

    private static function truthy(?string $v): bool
    {
        if ($v === null || $v === '') return false;
        return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    }
}
