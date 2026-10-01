<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VehicleUpgrade extends Model
{
    protected $fillable = ['player_vehicle_id', 'stat', 'level'];

    protected function casts(): array
    {
        return ['level' => 'integer'];
    }
}
