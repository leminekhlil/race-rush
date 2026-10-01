<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Cosmetic extends Model
{
    protected $fillable = ['code', 'type', 'name', 'hex', 'price', 'available', 'sort'];

    protected function casts(): array
    {
        return ['available' => 'boolean', 'price' => 'integer'];
    }
}
