<?php

namespace Tests\Feature;

use App\Models\PlayerProfile;
use App\Services\WalletService;

class GarageTest extends ApiTestCase
{
    public function test_upgrade_debits_server_price_and_increments_level(): void
    {
        $g = $this->guest();
        $p = $this->auth($g['token'])->postJson('/api/garage/upgrade', ['vehicle' => 'sport', 'stat' => 'engine'])->assertOk()->json('profile');
        $sport = collect($p['vehicles'])->firstWhere('vehicle', 'sport');
        $this->assertSame(1, $sport['upgrades']['engine']);
        $this->assertSame(500 - 150, $p['balance']);
    }

    public function test_upgrade_is_idempotent_with_same_key(): void
    {
        $g = $this->guest();
        $h = ['Idempotency-Key' => 'abc12345-retry'];
        $this->auth($g['token'])->withHeaders($h)->postJson('/api/garage/upgrade', ['vehicle' => 'moto', 'stat' => 'handling'])->assertOk();
        $p = $this->auth($g['token'])->withHeaders($h)->postJson('/api/garage/upgrade', ['vehicle' => 'moto', 'stat' => 'handling'])->assertOk()->json('profile');
        $moto = collect($p['vehicles'])->firstWhere('vehicle', 'moto');
        $this->assertSame(1, $moto['upgrades']['handling']);
        $this->assertSame(350, $p['balance']);
    }

    public function test_upgrade_rejected_when_funds_insufficient(): void
    {
        $g = $this->guest();
        $this->auth($g['token'])->postJson('/api/garage/upgrade', ['vehicle' => 'sport', 'stat' => 'engine'])->assertOk(); // 350 left
        $this->auth($g['token'])->postJson('/api/garage/upgrade', ['vehicle' => 'sport', 'stat' => 'engine'])->assertOk(); // 50 left
        $this->auth($g['token'])->postJson('/api/garage/upgrade', ['vehicle' => 'sport', 'stat' => 'engine'])
            ->assertStatus(422)->assertJson(['error' => 'insufficient_funds']);
        $profile = PlayerProfile::where('user_id', (int) $g['profile']['id'])->first();
        $this->assertSame(50, $profile->vmru_balance);
        $this->assertSame(50, app(WalletService::class)->ledgerBalance($profile));
    }

    public function test_free_paint_applies_and_premium_paint_requires_purchase(): void
    {
        $g = $this->guest();
        $p = $this->auth($g['token'])->postJson('/api/garage/paint', ['vehicle' => 'sport', 'color' => 'blue'])->assertOk()->json('profile');
        $this->assertSame('blue', collect($p['vehicles'])->firstWhere('vehicle', 'sport')['color']);

        $this->auth($g['token'])->postJson('/api/garage/paint', ['vehicle' => 'sport', 'color' => 'neon'])->assertStatus(422)->assertJson(['error' => 'paint_locked']);
        // 600 v-MRU paint with a 500 balance: refused, nothing debited.
        $this->auth($g['token'])->postJson('/api/garage/cosmetics/violet/purchase')->assertStatus(422)->assertJson(['error' => 'insufficient_funds']);
        $this->auth($g['token'])->getJson('/api/me')->assertJsonPath('profile.balance', 500);
    }

    public function test_premium_purchase_debits_and_cannot_be_bought_twice(): void
    {
        $g = $this->guest();
        $profile = PlayerProfile::where('user_id', (int) $g['profile']['id'])->first();
        app(WalletService::class)->credit($profile, 1000, 'test_grant', 'grant-1');
        $p = $this->auth($g['token'])->postJson('/api/garage/cosmetics/neon/purchase')->assertOk()->json('profile');
        $this->assertSame(1500 - 600, $p['balance']);
        $this->assertContains('neon', $p['cosmetics']);
        $this->auth($g['token'])->postJson('/api/garage/cosmetics/neon/purchase')->assertStatus(422)->assertJson(['error' => 'already_owned']);
        $this->auth($g['token'])->postJson('/api/garage/paint', ['vehicle' => 'moto', 'color' => 'neon'])->assertOk();
        $this->auth($g['token'])->postJson('/api/garage/cosmetics/wheels_neon/purchase')->assertStatus(422)->assertJson(['error' => 'not_available']);
    }

    public function test_cannot_select_unknown_vehicle(): void
    {
        $g = $this->guest();
        $this->auth($g['token'])->postJson('/api/garage/select', ['vehicle' => 'tank'])->assertUnprocessable();
        $this->auth($g['token'])->postJson('/api/garage/select', ['vehicle' => 'monster'])->assertOk()->assertJsonPath('profile.selectedVehicle', 'monster');
    }
}
