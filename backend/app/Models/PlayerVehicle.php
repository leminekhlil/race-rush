<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlayerVehicle extends Model
{
    protected $fillable = ['player_id', 'vehicle_id', 'paint_code'];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(PlayerProfile::class, 'player_id');
    }

    public function upgrades(): HasMany
    {
        return $this->hasMany(VehicleUpgrade::class);
    }

    /** @return array{engine:int,handling:int,boost:int,brakes:int} */
    public function upgradeLevels(): array
    {
        $levels = ['engine' => 0, 'handling' => 0, 'boost' => 0, 'brakes' => 0];
        foreach ($this->upgrades as $u) {
            $levels[$u->stat] = (int) $u->level;
        }

        return $levels;
    }
}
