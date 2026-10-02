<?php
// Race Rush: PHP entry point for hosts that do not apply Apache rewrites.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header('Permissions-Policy: microphone=(self), camera=(), geolocation=(), payment=()');
header('Cache-Control: no-store');
if ($path === '/api' || str_starts_with($path, '/api/')) {
    define('RACE_RUSH_API_ENTRY', true);
    require __DIR__.'/laravel-api.php';
    exit;
}
if (preg_match('~^/(?:racerush-app|game|public|patch-backup)(?:/|$)|(?:^|/)\.(?!well-known/)|\.(?:env|log|sql|sqlite|ini|sh|md|lock|bak|zip)$~i', $path)) {
    http_response_code(404);
    exit;
}
if (preg_match('~^/(assets|models|env|audio|fonts|app-icons)/~', $path)) {
    http_response_code(404);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}
header('Content-Type: text/html; charset=utf-8');
// Hostinger caches static JS for a year; refresh runtime config after each edit.
$html = file_get_contents(__DIR__.'/app-shell.html');
$configVersion = (string) filemtime(__DIR__.'/config.js');
echo preg_replace('~src="\./config\.js(?:\?[^"]*)?"~', 'src="./config.js?v='.$configVersion.'"', $html);
