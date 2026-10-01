<?php

namespace App\Services;

use App\Models\PlayerProfile;
use RuntimeException;

/**
 * Short-lived signed tickets that let the realtime server identify a player without a DB round-trip.
 * Format: base64url(json).base64url(hmac_sha256(secret, "ticket." . payload)).
 */
class TicketService
{
    public function issue(PlayerProfile $profile): array
    {
        $profile->loadMissing('vehicles.vehicle', 'vehicles.upgrades');
        $vehicles = [];
        foreach ($profile->vehicles as $pv) {
            $u = $pv->upgradeLevels();
            $vehicles[$pv->vehicle->code] = ['c' => $pv->paint_code, 'u' => [$u['engine'], $u['handling'], $u['boost']]];
        }
        $exp = time() + (int) config('racerush.ticket_ttl');
        $payload = [
            'uid' => $profile->user_id,
            'pid' => $profile->id,
            'name' => $profile->display_name,
            'lvl' => $profile->level,
            'veh' => $vehicles,
            'exp' => $exp,
            'nonce' => bin2hex(random_bytes(6)),
        ];
        $body = self::b64(json_encode($payload, JSON_UNESCAPED_UNICODE));

        return ['ticket' => $body.'.'.self::b64($this->sign($body)), 'expires_at' => $exp];
    }

    public function verify(string $ticket): ?array
    {
        $parts = explode('.', $ticket);
        if (count($parts) !== 2) {
            return null;
        }
        [$body, $sig] = $parts;
        if (! hash_equals(self::b64($this->sign($body)), $sig)) {
            return null;
        }
        $payload = json_decode(self::unb64($body), true);
        if (! is_array($payload) || ($payload['exp'] ?? 0) < time()) {
            return null;
        }

        return $payload;
    }

    private function sign(string $body): string
    {
        $secret = (string) config('racerush.realtime_secret');
        if ($secret === '') {
            throw new RuntimeException('RACERUSH_REALTIME_SECRET is not configured.');
        }

        return hash_hmac('sha256', 'ticket.'.$body, $secret, true);
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function unb64(string $s): string
    {
        return (string) base64_decode(strtr($s, '-_', '+/'));
    }
}
