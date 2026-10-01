<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RacePlayer extends Model
{
    protected $fillable = ['race_id', 'player_id', 'bot_name', 'vehicle_code', 'paint_code', 'grid_slot'];
}
