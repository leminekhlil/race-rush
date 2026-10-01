<?php

namespace Tests\Feature;

use App\Models\PlayerProfile;
use App\Services\WalletService;
use Illuminate\Support\Str;

class RaceRewardsTest extends ApiTestCase
{
    private function finishPayload(array $rows): array
    {
        return ['results' => $rows];
    }

    public function test_internal_endpoints_reject_unsigned_and_player_tokens(): void
    {
        $g = $this->guest();
        $this->auth($g['token'])->postJson('/api/internal/races', [])->assertUnauthorized();
        $this->internal('POST', '/api/internal/races', ['uuid' => (string) Str::uuid()], 'wrong-secret')->assertUnauthorized();
        $this->internal('POST', '/api/internal/races', ['uuid' => (string) Str::uuid()], null, time() - 3600)->assertUnauthorized();
    }

    public function test_race_rewards_are_granted_once_and_ledgered(): void
    {
        $a = $this->guest('Alice');
        $b = $this->guest('Bob');
        $uuid = $this->startRace([$a['profile']['id'], $b['profile']['id']], 2);
        $payload = $this->finishPayload([
            ['slot' => 0, 'position' => 1, 'finished' => true, 'time_ms' => 95000, 'best_lap_ms' => 30500],
            ['slot' => 2, 'position' => 2, 'finished' => true, 'time_ms' => 97000, 'best_lap_ms' => 31500],
            ['slot' => 1, 'position' => 3, 'finished' => true, 'time_ms' => 99000, 'best_lap_ms' => 32000],
            ['slot' => 3, 'position' => 4, 'finished' => false, 'time_ms' => null, 'best_lap_ms' => null],
        ]);
        $first = $this->internal('POST', "/api/internal/races/$uuid/finish", $payload)->assertOk()->json('rewards');
        $alice = $first[$a['profile']['id']];
        $bob = $first[$b['profile']['id']];
        // Alice: (60 + 120) * 1.1 (beat one human) = 198 XP; (30 + 150) * 1.1 = 198 v-MRU.
        $this->assertSame(198, $alice['xp']);
        $this->assertSame(198, $alice['vmru']);
        $this->assertSame(500 + 198, $alice['balance']);
        // Bob P3: (60 + 60) = 120 XP; 30 + 70 = 100 v-MRU.
        $this->assertSame(120, $bob['xp']);
        $this->assertSame(100, $bob['vmru']);

        // Replay of the same finish (network retry / malicious) → identical answer, no second booking.
        $second = $this->internal('POST', "/api/internal/races/$uuid/finish", $payload)->assertOk()->json('rewards');
        $this->assertEquals($first, $second);
        $profile = PlayerProfile::where('user_id', (int) $a['profile']['id'])->first();
        $this->assertSame(698, $profile->vmru_balance);
        $this->assertSame(698, app(WalletService::class)->ledgerBalance($profile));
        $this->assertSame(1, $profile->wins);
        $this->assertSame(1, $profile->races_played);
        $this->assertDatabaseCount('race_results', 4);
        $this->assertSame(1, \App\Models\WalletTransaction::where(['player_id' => $profile->id, 'source' => 'race_reward'])->count());

        // The player can read their own result.
        $this->auth($a['token'])->getJson("/api/races/$uuid/result")->assertOk()->assertJsonPath('result.position', 1);
    }

    public function test_impossible_time_is_flagged_and_unrewarded(): void
    {
        $a = $this->guest('Cheater');
        $uuid = $this->startRace([$a['profile']['id']], 1);
        $rewards = $this->internal('POST', "/api/internal/races/$uuid/finish", $this->finishPayload([
            ['slot' => 0, 'position' => 1, 'finished' => true, 'time_ms' => 20000, 'best_lap_ms' => 6000],
            ['slot' => 1, 'position' => 2, 'finished' => true, 'time_ms' => 100000, 'best_lap_ms' => 33000],
        ]))->assertOk()->json('rewards');
        $r = $rewards[$a['profile']['id']];
        $this->assertTrue($r['flagged']);
        $this->assertSame(0, $r['xp']);
        $this->assertSame(0, $r['vmru']);
        $this->assertSame(500, $r['balance']);
        $this->assertDatabaseHas('race_anomalies', ['kind' => 'race_time']);
    }

    public function test_server_side_flag_from_realtime_blocks_rewards_and_logs_anomalies(): void
    {
        $a = $this->guest('Teleporter');
        $uuid = $this->startRace([$a['profile']['id']]);
        $rewards = $this->internal('POST', "/api/internal/races/$uuid/finish", $this->finishPayload([
            ['slot' => 0, 'position' => 1, 'finished' => true, 'time_ms' => 90000, 'best_lap_ms' => 29000, 'flagged' => true, 'anomalies' => [['kind' => 'teleport', 'detail' => 'moved 300m']]],
        ]))->assertOk()->json('rewards');
        $this->assertSame(0, $rewards[$a['profile']['id']]['vmru']);
        $this->assertDatabaseHas('race_anomalies', ['kind' => 'teleport']);
    }

    public function test_inconsistent_results_are_rejected(): void
    {
        $a = $this->guest('Ace');
        $uuid = $this->startRace([$a['profile']['id']], 1);
        $this->internal('POST', "/api/internal/races/$uuid/finish", $this->finishPayload([
            ['slot' => 0, 'position' => 1, 'finished' => true, 'time_ms' => 90000, 'best_lap_ms' => 29000],
            ['slot' => 1, 'position' => 1, 'finished' => true, 'time_ms' => 91000, 'best_lap_ms' => 29500],
        ]))->assertStatus(422)->assertJson(['error' => 'invalid_results']);
        $this->internal('POST', "/api/internal/races/$uuid/finish", $this->finishPayload([
            ['slot' => 4, 'position' => 1, 'finished' => true, 'time_ms' => 90000, 'best_lap_ms' => 29000],
        ]))->assertStatus(422);
    }

    public function test_level_up_is_computed_server_side(): void
    {
        $a = $this->guest('Leveler');
        $b = $this->guest('Other');
        $levelBefore = 1;
        $balance = 500;
        for ($i = 0; $i < 3; $i++) {
            $uuid = $this->startRace([$a['profile']['id'], $b['profile']['id']]);
            $r = $this->internal('POST', "/api/internal/races/$uuid/finish", $this->finishPayload([
                ['slot' => 0, 'position' => 1, 'finished' => true, 'time_ms' => 90000, 'best_lap_ms' => 29000],
                ['slot' => 1, 'position' => 2, 'finished' => true, 'time_ms' => 95000, 'best_lap_ms' => 30000],
            ]))->assertOk()->json('rewards')[$a['profile']['id']];
            $balance += $r['vmru'];
        }
        $me = $this->auth($a['token'])->getJson('/api/me')->assertOk()->json('profile');
        $this->assertSame(594, $me['xp']); // 3 × 198
        $this->assertSame(3, $me['level']); // 200 → L2, 520 → L3
        $this->assertGreaterThan($levelBefore, $me['level']);
        $this->assertSame($balance, $me['balance']);
    }

    public function test_lobby_upsert_tracks_players(): void
    {
        $a = $this->guest('Host');
        $this->internal('POST', '/api/internal/lobbies', [
            'code' => '7X9K', 'host_user_id' => (int) $a['profile']['id'], 'track' => 'city', 'laps' => 3,
            'status' => 'WAITING', 'bot_fill' => true, 'solo' => false, 'max_players' => 5, 'user_ids' => [(int) $a['profile']['id']],
        ])->assertOk();
        $this->assertDatabaseHas('lobbies', ['code' => '7X9K', 'status' => 'WAITING']);
        $this->assertDatabaseCount('lobby_players', 1);
    }
}
