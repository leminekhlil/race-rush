<?php

namespace App\Http\Controllers;

use App\Exceptions\GameRuleException;
use App\Models\Cosmetic;
use App\Models\PlayerProfile;
use App\Models\PlayerVehicle;
use App\Models\VehicleUpgrade;
use App\Services\ProfilePresenter;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Garage operations. The client only *requests*; prices, ownership and levels are decided here.
 */
class GarageController extends Controller
{
    public function __construct(
        private readonly WalletService $wallet,
        private readonly ProfilePresenter $presenter,
    ) {}

    private function profile(Request $request): PlayerProfile
    {
        return $request->user()->profile;
    }

    private function ownedVehicle(PlayerProfile $p, string $code): PlayerVehicle
    {
        $pv = PlayerVehicle::where('player_id', $p->id)->whereHas('vehicle', fn ($q) => $q->where('code', $code))->first();
        if (! $pv) {
            throw new GameRuleException('vehicle_not_owned', 'Véhicule non possédé.');
        }

        return $pv;
    }

    public function select(Request $request): JsonResponse
    {
        $data = $request->validate(['vehicle' => ['required', Rule::in(array_keys(config('racerush.vehicles')))]]);
        $p = $this->profile($request);
        $this->ownedVehicle($p, $data['vehicle']);
        $p->selected_vehicle = $data['vehicle'];
        $p->save();

        return response()->json(['profile' => $this->presenter->present($p->fresh())]);
    }

    public function paint(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle' => ['required', Rule::in(array_keys(config('racerush.vehicles')))],
            'color' => ['required', 'string', 'max:24'],
        ]);
        $p = $this->profile($request);
        $pv = $this->ownedVehicle($p, $data['vehicle']);
        $cosmetic = Cosmetic::where(['code' => $data['color'], 'type' => 'paint'])->first();
        if (! $cosmetic) {
            throw new GameRuleException('unknown_paint', 'Peinture inconnue.');
        }
        if (! $p->cosmetics()->whereKey($cosmetic->id)->exists()) {
            throw new GameRuleException('paint_locked', 'Peinture non débloquée.');
        }
        $pv->paint_code = $cosmetic->code;
        $pv->save();

        return response()->json(['profile' => $this->presenter->present($p->fresh())]);
    }

    public function purchase(Request $request, string $code): JsonResponse
    {
        $p = $this->profile($request);
        $cosmetic = Cosmetic::where('code', $code)->first();
        if (! $cosmetic || ! $cosmetic->available) {
            throw new GameRuleException('not_available', 'Article indisponible.');
        }
        DB::transaction(function () use ($p, $cosmetic) {
            $locked = PlayerProfile::whereKey($p->id)->lockForUpdate()->firstOrFail();
            if ($locked->cosmetics()->whereKey($cosmetic->id)->exists()) {
                throw new GameRuleException('already_owned', 'Déjà possédé.');
            }
            $this->wallet->debit($locked, $cosmetic->price, 'cosmetic', $cosmetic->code, ['cosmetic' => $cosmetic->code]);
            $locked->cosmetics()->attach($cosmetic->id, ['acquired_at' => now()]);
        });
        Log::info('garage.purchase', ['player_id' => $p->id, 'cosmetic' => $cosmetic->code, 'price' => $cosmetic->price]);

        return response()->json(['profile' => $this->presenter->present($p->fresh())]);
    }

    public function upgrade(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle' => ['required', Rule::in(array_keys(config('racerush.vehicles')))],
            'stat' => ['required', Rule::in(config('racerush.upgrade_stats'))],
        ]);
        $key = (string) $request->header('Idempotency-Key', '');
        $idempotency = preg_match('/^[A-Za-z0-9\-]{8,64}$/', $key) ? $key : (string) Str::uuid();
        $p = $this->profile($request);
        $pv = $this->ownedVehicle($p, $data['vehicle']);

        DB::transaction(function () use ($p, $pv, $data, $idempotency) {
            $locked = PlayerProfile::whereKey($p->id)->lockForUpdate()->firstOrFail();
            $reference = "upgrade:{$idempotency}";
            if ($locked->transactions()->where(['source' => 'upgrade', 'reference' => $reference])->exists()) {
                return; // replayed request: already applied
            }
            $up = VehicleUpgrade::where(['player_vehicle_id' => $pv->id, 'stat' => $data['stat']])->lockForUpdate()->first()
                ?? VehicleUpgrade::create(['player_vehicle_id' => $pv->id, 'stat' => $data['stat'], 'level' => 0]);
            $max = (int) config('racerush.max_upgrade_level');
            if ($up->level >= $max) {
                throw new GameRuleException('max_level', 'Niveau maximum atteint.');
            }
            $cost = (int) config('racerush.upgrade_costs')[$up->level];
            $this->wallet->debit($locked, $cost, 'upgrade', $reference, ['vehicle' => $data['vehicle'], 'stat' => $data['stat'], 'to' => $up->level + 1]);
            $up->level = $up->level + 1;
            $up->save();
        });
        Log::info('garage.upgrade', ['player_id' => $p->id, 'vehicle' => $data['vehicle'], 'stat' => $data['stat']]);

        return response()->json(['profile' => $this->presenter->present($p->fresh())]);
    }
}
