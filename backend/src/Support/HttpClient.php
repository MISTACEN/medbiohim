<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class HttpClient
{
    /** Sber GigaChat uses intermediate CA; allow disable via env. */
    private static function applySsl($ch, string $url): void
    {
        // TLS verification stays enabled by default. It may only be disabled
        // explicitly for a controlled diagnostic environment.
        $forceOff = in_array(strtolower((string) (Env::get('HTTP_VERIFY_SSL', '1') ?? '1')), ['0', 'false', 'no'], true);
        if ($forceOff) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        }
    }

    /**
     * @param array<string, string> $headers
     * @return array{status: int, body: string, json: ?array}
     */
    public static function request(
        string $method,
        string $url,
        ?array $jsonBody = null,
        array $headers = [],
        int $timeout = 15
    ): array {
        $payload = $jsonBody !== null ? json_encode($jsonBody, JSON_UNESCAPED_UNICODE) : null;
        $headers = array_merge(['Accept: application/json'], $headers);
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
        }

        if (extension_loaded('curl')) {
            return self::viaCurl($method, $url, $payload, $headers, $timeout);
        }
        return self::viaStream($method, $url, $payload, $headers, $timeout);
    }

    private static function viaCurl(
        string $method,
        string $url,
        ?string $payload,
        array $headers,
        int $timeout
    ): array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        self::applySsl($ch, $url);
        if ($payload !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        }
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            Logger::error('http_client_curl', ['error' => $err, 'url' => $url]);
            return ['status' => 0, 'body' => '', 'json' => null];
        }
        $json = json_decode($body, true);
        return [
            'status' => $status,
            'body' => $body,
            'json' => is_array($json) ? $json : null,
        ];
    }

    private static function viaStream(
        string $method,
        string $url,
        ?string $payload,
        array $headers,
        int $timeout
    ): array {
        $opts = [
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $headers),
                'timeout' => $timeout,
                'ignore_errors' => true,
            ],
        ];
        if ($payload !== null) {
            $opts['http']['content'] = $payload;
        }
        $ctx = stream_context_create($opts);
        $body = @file_get_contents($url, false, $ctx);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $status = (int) $m[1];
        }
        if ($body === false) {
            return ['status' => 0, 'body' => '', 'json' => null];
        }
        $json = json_decode($body, true);
        return [
            'status' => $status,
            'body' => $body,
            'json' => is_array($json) ? $json : null,
        ];
    }

    /** @param array<string,string> $form */
    public static function form(string $method, string $url, array $form = [], array $headers = [], int $timeout = 15): array
    {
        $payload = http_build_query($form, '', '&', PHP_QUERY_RFC3986);
        $headers = array_merge(['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'], $headers);
        if (extension_loaded('curl')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_RETURNTRANSFER=>true, CURLOPT_HTTPHEADER=>$headers, CURLOPT_TIMEOUT=>$timeout, CURLOPT_CONNECTTIMEOUT=>5, CURLOPT_POSTFIELDS=>$payload]);
            self::applySsl($ch, $url);
            $body = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
            if ($body === false) { Logger::error('http_client_curl_form',['error'=>$err,'url'=>$url]); return ['status'=>0,'body'=>'','json'=>null]; }
            $json=json_decode($body,true); return ['status'=>$status,'body'=>$body,'json'=>is_array($json)?$json:null];
        }
        $opts=['http'=>['method'=>$method,'header'=>implode("\r\n",$headers),'timeout'=>$timeout,'ignore_errors'=>true,'content'=>$payload]];
        $body=@file_get_contents($url,false,stream_context_create($opts)); $status=0;
        if(isset($http_response_header[0])&&preg_match('/\s(\d{3})\s/',$http_response_header[0],$m))$status=(int)$m[1];
        if($body===false)return ['status'=>0,'body'=>'','json'=>null]; $json=json_decode($body,true); return ['status'=>$status,'body'=>$body,'json'=>is_array($json)?$json:null];
    }

}
