<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RaceAnomaly extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['race_id', 'player_id', 'kind', 'detail', 'created_at'];
}
