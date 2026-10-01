<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Lobby extends Model
{
    protected $fillable = ['code', 'host_player_id', 'track_code', 'laps', 'status', 'max_players', 'bot_fill', 'solo', 'closed_at'];

    protected function casts(): array
    {
        return ['bot_fill' => 'boolean', 'solo' => 'boolean', 'closed_at' => 'datetime'];
    }
}
