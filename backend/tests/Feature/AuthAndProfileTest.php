<?php

namespace Tests\Feature;

use App\Models\PlayerProfile;
use App\Services\WalletService;

class AuthAndProfileTest extends ApiTestCase
{
    public function test_guest_account_is_provisioned_with_starter_garage_and_ledgered_balance(): void
    {
        $res = $this->guest('Lemine');
        $p = $res['profile'];
        $this->assertSame('Lemine', $p['name']);
        $this->assertSame(1, $p['level']);
        $this->assertSame(500, $p['balance']);
        $this->assertCount(4, $p['vehicles']);
        $this->assertEqualsCanonicalizing(['red', 'blue', 'yellow', 'black', 'white'], $p['cosmetics']);

        $profile = PlayerProfile::where('user_id', (int) $p['id'])->first();
        $this->assertSame(500, app(WalletService::class)->ledgerBalance($profile));
        $this->assertDatabaseHas('wallet_transactions', ['player_id' => $profile->id, 'source' => 'starter_bonus', 'amount' => 500]);
    }

    public function test_endpoints_require_authentication(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
        $this->postJson('/api/garage/upgrade', ['vehicle' => 'sport', 'stat' => 'engine'])->assertUnauthorized();
        $this->postJson('/api/realtime/ticket')->assertUnauthorized();
    }

    public function test_guest_name_is_validated(): void
    {
        $this->postJson('/api/auth/guest', ['name' => '<script>'])->assertUnprocessable();
        $this->postJson('/api/auth/guest', ['name' => 'x'])->assertUnprocessable();
    }

    public function test_guest_can_register_then_login_keeping_progression(): void
    {
        $g = $this->guest('Racer');
        $this->auth($g['token'])->postJson('/api/auth/register', ['email' => 'racer@example.com', 'password' => 'secret-pass-1'])->assertOk();
        $login = $this->postJson('/api/auth/login', ['email' => 'racer@example.com', 'password' => 'secret-pass-1'])->assertOk()->json();
        $this->assertSame($g['profile']['id'], $login['profile']['id']);
        $this->postJson('/api/auth/login', ['email' => 'racer@example.com', 'password' => 'wrong-pass'])->assertUnprocessable();
    }

    public function test_realtime_ticket_is_signed_and_verifiable(): void
    {
        $g = $this->guest('Ticket');
        $t = $this->auth($g['token'])->postJson('/api/realtime/ticket')->assertOk()->json();
        $payload = app(\App\Services\TicketService::class)->verify($t['ticket']);
        $this->assertNotNull($payload);
        $this->assertSame((int) $g['profile']['id'], $payload['uid']);
        $this->assertArrayHasKey('sport', $payload['veh']);
        // Tampered ticket is rejected.
        [$body, $sig] = explode('.', $t['ticket']);
        $this->assertNull(app(\App\Services\TicketService::class)->verify($body.'x.'.$sig));
    }
}
