<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlayerProfile extends Model
{
    protected $fillable = ['user_id', 'display_name', 'level', 'xp', 'vmru_balance', 'selected_vehicle', 'races_played', 'wins'];

    protected function casts(): array
    {
        return ['level' => 'integer', 'xp' => 'integer', 'vmru_balance' => 'integer', 'races_played' => 'integer', 'wins' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function vehicles(): HasMany
    {
        return $this->hasMany(PlayerVehicle::class, 'player_id');
    }

    public function cosmetics(): BelongsToMany
    {
        return $this->belongsToMany(Cosmetic::class, 'player_cosmetics', 'player_id', 'cosmetic_id')->withPivot('acquired_at');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(WalletTransaction::class, 'player_id');
    }
}
