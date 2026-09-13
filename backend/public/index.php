<?php
declare(strict_types=1);

/**
 * MEDBIOHIM API front controller (Phase A)
 * Deploy: document root = this public/ directory on SpaceWeb.
 */

require dirname(__DIR__) . '/src/Bootstrap.php';

Medbiohim\Bootstrap::run();
