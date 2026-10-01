<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates server-to-server calls from the realtime server.
 * Signature = hex(hmac_sha256(secret, "{timestamp}.{METHOD}.{path}.{sha256(body)}")).
 */
class VerifyInternalSignature
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('racerush.realtime_secret');
        $ts = (string) $request->header('X-RR-Timestamp', '');
        $sig = (string) $request->header('X-RR-Signature', '');
        if ($secret === '' || $ts === '' || $sig === '' || ! ctype_digit($ts)) {
            return $this->deny($request, 'missing');
        }
        if (abs(time() - (int) $ts) > (int) config('racerush.internal_max_skew')) {
            return $this->deny($request, 'stale');
        }
        $base = $ts.'.'.strtoupper($request->method()).'.'.$request->getPathInfo().'.'.hash('sha256', $request->getContent());
        if (! hash_equals(hash_hmac('sha256', $base, $secret), $sig)) {
            return $this->deny($request, 'bad_signature');
        }

        return $next($request);
    }

    private function deny(Request $request, string $reason): Response
    {
        Log::warning('internal.denied', ['reason' => $reason, 'path' => $request->getPathInfo(), 'ip' => $request->ip()]);

        return response()->json(['error' => 'unauthorized'], 401);
    }
}
