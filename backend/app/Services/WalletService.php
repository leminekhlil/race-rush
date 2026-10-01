<?php

namespace App\Services;

use App\Exceptions\GameRuleException;
use App\Models\PlayerProfile;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;

/**
 * v-MRU ledger. Every balance change is a wallet_transactions row written in the same DB transaction
 * as the cached balance update. (player, source, reference) is unique → a business event is booked once.
 */
class WalletService
{
    public function credit(PlayerProfile $player, int $amount, string $source, string $reference, array $meta = []): WalletTransaction
    {
        return $this->book($player, 'credit', $amount, $source, $reference, $meta);
    }

    public function debit(PlayerProfile $player, int $amount, string $source, string $reference, array $meta = []): WalletTransaction
    {
        return $this->book($player, 'debit', $amount, $source, $reference, $meta);
    }

    private function book(PlayerProfile $player, string $type, int $amount, string $source, string $reference, array $meta): WalletTransaction
    {
        if ($amount < 0) {
            throw new GameRuleException('invalid_amount', 'Montant invalide.');
        }

        return DB::transaction(function () use ($player, $type, $amount, $source, $reference, $meta) {
            /** @var PlayerProfile $locked */
            $locked = PlayerProfile::whereKey($player->id)->lockForUpdate()->firstOrFail();
            $existing = WalletTransaction::where(['player_id' => $locked->id, 'source' => $source, 'reference' => $reference])->first();
            if ($existing) {
                return $existing;
            }
            $balance = (int) $locked->vmru_balance;
            if ($type === 'debit' && $balance < $amount) {
                throw new GameRuleException('insufficient_funds', 'Solde v-MRU insuffisant.');
            }
            $after = $type === 'credit' ? $balance + $amount : $balance - $amount;
            $tx = WalletTransaction::create([
                'player_id' => $locked->id,
                'type' => $type,
                'amount' => $amount,
                'balance_after' => $after,
                'source' => $source,
                'reference' => $reference,
                'meta' => $meta ?: null,
                'created_at' => now(),
            ]);
            $locked->vmru_balance = $after;
            $locked->save();
            $player->vmru_balance = $after;

            return $tx;
        });
    }

    /** Balance recomputed from the ledger (used by integrity checks/tests). */
    public function ledgerBalance(PlayerProfile $player): int
    {
        $credits = (int) WalletTransaction::where('player_id', $player->id)->where('type', 'credit')->sum('amount');
        $debits = (int) WalletTransaction::where('player_id', $player->id)->where('type', 'debit')->sum('amount');

        return $credits - $debits;
    }
}
