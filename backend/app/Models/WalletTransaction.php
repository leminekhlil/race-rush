<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WalletTransaction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['player_id', 'type', 'amount', 'balance_after', 'source', 'reference', 'meta', 'created_at'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'amount' => 'integer', 'balance_after' => 'integer'];
    }
}
