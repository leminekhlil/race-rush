<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Race extends Model
{
    protected $fillable = ['uuid', 'lobby_id', 'track_code', 'laps', 'status', 'human_count', 'bot_count', 'started_at', 'finished_at'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'finished_at' => 'datetime', 'laps' => 'integer'];
    }

    public function players(): HasMany
    {
        return $this->hasMany(RacePlayer::class);
    }

    public function results(): HasMany
    {
        return $this->hasMany(RaceResult::class);
    }
}
