<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerProgression extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'player_progression';

    protected $fillable = ['player_id', 'race_id', 'xp_delta', 'xp_after', 'level_before', 'level_after', 'reason', 'created_at'];
}
