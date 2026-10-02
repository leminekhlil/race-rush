<?php

/*
 * Race Rush API front controller for Hostinger shared hosting.
 *
 * The web root (public_html) only contains the built game and this file. The Laravel application
 * (code, vendor, .env, storage) lives in `racerush-app/`, NEXT TO public_html (not reachable over HTTP).
 * Requests to /api/* are rewritten here by public_html/.htaccess.
 */

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

if (! defined('RACE_RUSH_API_ENTRY')) {
    http_response_code(403);
    exit;
}

define('LARAVEL_START', microtime(true));

$fail = static function (string $code, string $message): never {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $code, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
};

if (PHP_VERSION_ID < 80300) {
    $fail('php_version', 'PHP 8.3 ou plus récent est requis (hPanel → Avancé → Configuration PHP).');
}

$base = null;
foreach ([__DIR__.'/../racerush-app', __DIR__.'/racerush-app'] as $candidate) {
    if (is_file($candidate.'/vendor/autoload.php')) {
        $base = realpath($candidate);
        break;
    }
}
if ($base === null) {
    $fail('backend_missing', 'API non installée : dossier racerush-app introuvable à côté de public_html.');
}
if (! is_file($base.'/.env')) {
    $fail('backend_not_configured', 'API non configurée : créer racerush-app/.env à partir de .env.example.');
}

if (file_exists($maintenance = $base.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $base.'/vendor/autoload.php';

/** @var Application $app */
$app = require_once $base.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);

$app->handleRequest(Request::capture());
