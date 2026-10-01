<?php

namespace App\Services;

use App\Models\PlayerProfile;
use App\Models\PlayerProgression;

class ProgressionService
{
    public function xpToNext(int $level): int
    {
        $c = config('racerush.level_curve');

        return $c['base'] + max(0, $level - 1) * $c['step'];
    }

    /** Total XP required to reach the start of a level. */
    public function xpForLevel(int $level): int
    {
        $total = 0;
        for ($l = 1; $l < $level; $l++) {
            $total += $this->xpToNext($l);
        }

        return $total;
    }

    public function levelForXp(int $xp): int
    {
        $max = (int) config('racerush.level_curve.max_level');
        $level = 1;
        while ($level < $max && $xp >= $this->xpForLevel($level + 1)) {
            $level++;
        }

        return $level;
    }

    /** Applies an XP gain; must run inside the caller's DB transaction (row already locked). */
    public function grantXp(PlayerProfile $player, int $xp, ?int $raceId, string $reason): array
    {
        $before = (int) $player->level;
        $player->xp = (int) $player->xp + max(0, $xp);
        $player->level = $this->levelForXp((int) $player->xp);
        $player->save();
        PlayerProgression::create([
            'player_id' => $player->id,
            'race_id' => $raceId,
            'xp_delta' => $xp,
            'xp_after' => $player->xp,
            'level_before' => $before,
            'level_after' => $player->level,
            'reason' => $reason,
            'created_at' => now(),
        ]);

        return ['level_before' => $before, 'level_after' => (int) $player->level];
    }
}
