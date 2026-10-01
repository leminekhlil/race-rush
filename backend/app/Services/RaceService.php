<?php

namespace App\Services;

use App\Exceptions\GameRuleException;
use App\Models\PlayerProfile;
use App\Models\PlayerProgression;
use App\Models\Race;
use App\Models\RaceAnomaly;
use App\Models\RacePlayer;
use App\Models\RaceResult;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Race lifecycle persistence and reward settlement.
 * The realtime server reports results; this service re-validates them and is the only place
 * where race rewards are computed and booked (idempotent per race).
 */
class RaceService
{
    public function __construct(
        private readonly WalletService $wallet,
        private readonly ProgressionService $progression,
    ) {}

    /** @param array{uuid:string,track:string,laps:int,lobby_id?:int|null,players:array<int,array>} $data */
    public function start(array $data): Race
    {
        return DB::transaction(function () use ($data) {
            $existing = Race::where('uuid', $data['uuid'])->first();
            if ($existing) {
                return $existing;
            }
            $userIds = collect($data['players'])->pluck('user_id')->filter()->all();
            $profiles = PlayerProfile::whereIn('user_id', $userIds)->get()->keyBy('user_id');
            if ($profiles->count() !== count(array_unique($userIds))) {
                throw new GameRuleException('unknown_player', 'Joueur inconnu dans la grille.');
            }
            $race = Race::create([
                'uuid' => $data['uuid'],
                'lobby_id' => $data['lobby_id'] ?? null,
                'track_code' => $data['track'],
                'laps' => $data['laps'],
                'status' => 'racing',
                'human_count' => count($userIds),
                'bot_count' => count($data['players']) - count($userIds),
                'started_at' => now(),
            ]);
            foreach ($data['players'] as $p) {
                RacePlayer::create([
                    'race_id' => $race->id,
                    'player_id' => isset($p['user_id']) ? $profiles[$p['user_id']]->id : null,
                    'bot_name' => $p['bot_name'] ?? null,
                    'vehicle_code' => $p['vehicle'],
                    'paint_code' => $p['color'],
                    'grid_slot' => $p['slot'],
                ]);
            }
            Log::info('race.started', ['race' => $race->uuid, 'track' => $race->track_code, 'humans' => $race->human_count, 'bots' => $race->bot_count]);

            return $race;
        });
    }

    /**
     * Settles a race. Idempotent: a second call returns the already-booked rewards without booking again.
     *
     * @param  array<int,array{slot:int,position:int,finished:bool,time_ms:?int,best_lap_ms:?int,flagged?:bool,anomalies?:array}>  $results
     * @return array<int,array> rewards keyed by user id
     */
    public function finish(string $uuid, array $results): array
    {
        return DB::transaction(function () use ($uuid, $results) {
            $race = Race::where('uuid', $uuid)->lockForUpdate()->first();
            if (! $race) {
                throw new GameRuleException('race_not_found', 'Course inconnue.', 404);
            }
            if ($race->status === 'finished') {
                return $this->rewardsFor($race);
            }
            if ($race->status !== 'racing') {
                throw new GameRuleException('race_closed', 'Course déjà clôturée.', 409);
            }

            $players = RacePlayer::where('race_id', $race->id)->get()->keyBy('grid_slot');
            $this->assertConsistent($results, $players->keys()->all());

            $track = config("racerush.tracks.{$race->track_code}");
            $minLapMs = (int) round(($track['min_lap'] ?? 10) * 1000);
            $minTotalMs = $minLapMs * (int) $race->laps;

            $humanRows = [];
            foreach ($results as $r) {
                $rp = $players[$r['slot']];
                $flagged = (bool) ($r['flagged'] ?? false);
                if ($r['finished'] && ($r['time_ms'] === null || $r['time_ms'] < $minTotalMs)) {
                    $flagged = true;
                    $this->anomaly($race->id, $rp->player_id, 'race_time', "total {$r['time_ms']}ms < {$minTotalMs}ms");
                }
                if (($r['best_lap_ms'] ?? null) !== null && $r['best_lap_ms'] < $minLapMs) {
                    $flagged = true;
                    $this->anomaly($race->id, $rp->player_id, 'lap_time', "best lap {$r['best_lap_ms']}ms < {$minLapMs}ms");
                }
                foreach (($r['anomalies'] ?? []) as $a) {
                    $this->anomaly($race->id, $rp->player_id, (string) ($a['kind'] ?? 'unknown'), (string) ($a['detail'] ?? ''));
                }
                $result = RaceResult::create([
                    'race_id' => $race->id,
                    'race_player_id' => $rp->id,
                    'player_id' => $rp->player_id,
                    'position' => $r['position'],
                    'finished' => $r['finished'],
                    'time_ms' => $r['time_ms'],
                    'best_lap_ms' => $r['best_lap_ms'] ?? null,
                    'flagged' => $flagged,
                ]);
                if ($rp->player_id) {
                    $humanRows[] = $result;
                }
            }

            foreach ($humanRows as $result) {
                $humansBeaten = collect($humanRows)->filter(fn ($o) => $o->id !== $result->id && $o->position > $result->position)->count();
                $this->reward($race, $result, $humansBeaten);
            }

            $race->status = 'finished';
            $race->finished_at = now();
            $race->save();
            Log::info('race.finished', ['race' => $race->uuid, 'results' => count($results)]);

            return $this->rewardsFor($race);
        });
    }

    private function reward(Race $race, RaceResult $result, int $humansBeaten): void
    {
        /** @var PlayerProfile $profile */
        $profile = PlayerProfile::whereKey($result->player_id)->lockForUpdate()->firstOrFail();
        $profile->races_played = (int) $profile->races_played + 1;
        if ($result->finished && $result->position === 1 && ! $result->flagged) {
            $profile->wins = (int) $profile->wins + 1;
        }
        [$xp, $vmru] = $result->flagged ? [0, 0] : $this->computeReward($result->position, $result->finished, $humansBeaten);

        if ($vmru > 0) {
            $this->wallet->credit($profile, $vmru, 'race_reward', $race->uuid, ['position' => $result->position]);
        }
        $this->progression->grantXp($profile, $xp, $race->id, 'race');
        $result->xp_awarded = $xp;
        $result->vmru_awarded = $vmru;
        $result->rewarded_at = now();
        $result->save();
    }

    /** @return array{0:int,1:int} [xp, vmru] */
    public function computeReward(int $position, bool $finished, int $humansBeaten): array
    {
        $c = config('racerush.rewards');
        $idx = max(0, $position - 1);
        if (! $finished) {
            return [(int) $c['dnf_xp'], (int) $c['dnf_vmru']];
        }
        $mult = 1 + $c['per_human_opponent'] * $humansBeaten;
        $posXp = $c['position_xp'][$idx] ?? end($c['position_xp']);
        $posV = $c['position_vmru'][$idx] ?? end($c['position_vmru']);

        return [(int) round(($c['finish_xp'] + $posXp) * $mult), (int) round(($c['finish_vmru'] + $posV) * $mult)];
    }

    /** @return array<int,array> */
    public function rewardsFor(Race $race): array
    {
        $out = [];
        $rows = RaceResult::where('race_id', $race->id)->whereNotNull('player_id')->get();
        foreach ($rows as $r) {
            $profile = PlayerProfile::find($r->player_id);
            $prog = PlayerProgression::where(['player_id' => $r->player_id, 'race_id' => $race->id, 'reason' => 'race'])->first();
            $out[$profile->user_id] = [
                'xp' => (int) $r->xp_awarded,
                'vmru' => (int) $r->vmru_awarded,
                'levelBefore' => (int) ($prog->level_before ?? $profile->level),
                'levelAfter' => (int) ($prog->level_after ?? $profile->level),
                'xpTotal' => (int) $profile->xp,
                'balance' => (int) $profile->vmru_balance,
                'flagged' => (bool) $r->flagged,
                'position' => (int) $r->position,
            ];
        }

        return $out;
    }

    private function assertConsistent(array $results, array $slots): void
    {
        $seenSlots = [];
        $positions = [];
        foreach ($results as $r) {
            if (! in_array($r['slot'], $slots, true) || isset($seenSlots[$r['slot']])) {
                throw new GameRuleException('invalid_results', 'Grille incohérente.');
            }
            $seenSlots[$r['slot']] = true;
            $positions[] = $r['position'];
        }
        sort($positions);
        if ($positions !== range(1, count($results))) {
            throw new GameRuleException('invalid_results', 'Classement incohérent.');
        }
    }

    public function anomaly(?int $raceId, ?int $playerId, string $kind, string $detail): void
    {
        RaceAnomaly::create(['race_id' => $raceId, 'player_id' => $playerId, 'kind' => substr($kind, 0, 32), 'detail' => substr($detail, 0, 255), 'created_at' => now()]);
        Log::warning('anticheat.anomaly', ['race_id' => $raceId, 'player_id' => $playerId, 'kind' => $kind, 'detail' => $detail]);
    }

    public function profileIdForUser(int $userId): ?int
    {
        return User::find($userId)?->profile?->id;
    }
}
