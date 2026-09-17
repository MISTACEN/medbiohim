<?php
declare(strict_types=1);

/**
 * TEMPORARY VERCEL PHP API BRIDGE
 *
 * The production API normally runs on SpaceWeb. This file allows the same
 * PHP backend to execute inside Vercel's custom PHP runtime for diagnostics.
 * It deliberately preserves the public /api/v1/* request path for the
 * existing MEDBIOHIM router.
 */
$path = $_GET['__path'] ?? null;
if (is_string($path) && $path !== '') {
    unset($_GET['__path']);
    $_SERVER['REQUEST_URI'] = '/api/v1/' . ltrim($path, '/');
} else {
    unset($_GET['__path']);
    $_SERVER['REQUEST_URI'] = '/api/v1';
}

require dirname(__DIR__) . '/backend/src/Bootstrap.php';

Medbiohim\Bootstrap::run();
