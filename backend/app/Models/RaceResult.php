<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RaceResult extends Model
{
    protected $fillable = ['race_id', 'race_player_id', 'player_id', 'position', 'finished', 'time_ms', 'best_lap_ms', 'flagged', 'xp_awarded', 'vmru_awarded', 'rewarded_at'];

    protected function casts(): array
    {
        return ['finished' => 'boolean', 'flagged' => 'boolean', 'rewarded_at' => 'datetime'];
    }

    public function racePlayer(): BelongsTo
    {
        return $this->belongsTo(RacePlayer::class);
    }
}
