<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class Logger
{
    private static string $path = '';

    public static function init(string $logFile): void
    {
        self::$path = $logFile;
        $dir = dirname($logFile);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
    }

    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }

    public static function error(string $message, array $context = []): void
    {
        self::write('ERROR', $message, $context);
    }

    private static function write(string $level, string $message, array $context): void
    {
        $safe = [];
        foreach ($context as $k => $v) {
            $key = strtolower((string) $k);
            if (preg_match('/(secret|password|key|token|authorization)/', $key)) {
                $safe[$k] = '[redacted]';
                continue;
            }
            if (is_scalar($v) || $v === null) {
                $safe[$k] = $v;
            } else {
                $safe[$k] = '[complex]';
            }
        }

        $line = sprintf(
            "[%s] %s %s %s\n",
            date('c'),
            $level,
            $message,
            $safe !== [] ? json_encode($safe, JSON_UNESCAPED_UNICODE) : ''
        );

        if (self::$path !== '') {
            @file_put_contents(self::$path, $line, FILE_APPEND | LOCK_EX);
        }
    }
}
