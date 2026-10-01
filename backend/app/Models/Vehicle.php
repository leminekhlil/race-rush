<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Vehicle extends Model
{
    protected $fillable = ['code', 'name', 'stat_speed', 'stat_accel', 'stat_handling', 'stat_stability', 'price', 'starter', 'sort'];

    protected function casts(): array
    {
        return ['starter' => 'boolean', 'price' => 'integer'];
    }
}
