<?php

namespace App\Services;

use App\Models\Cosmetic;
use App\Models\PlayerProfile;

class ProfilePresenter
{
    public function __construct(private readonly ProgressionService $progression) {}

    public function present(PlayerProfile $p): array
    {
        $p->loadMissing('vehicles.vehicle', 'vehicles.upgrades', 'cosmetics');
        $vehicles = $p->vehicles->sortBy(fn ($pv) => $pv->vehicle->sort)->values()->map(function ($pv) {
            $u = $pv->upgradeLevels();

            return [
                'vehicle' => $pv->vehicle->code,
                'owned' => true,
                'color' => $pv->paint_code,
                'level' => 1 + $u['engine'] + $u['handling'] + $u['boost'] + $u['brakes'],
                'upgrades' => $u,
            ];
        });

        return [
            'id' => (string) $p->user_id,
            'name' => $p->display_name,
            'level' => (int) $p->level,
            'xp' => (int) $p->xp,
            'xpLevelStart' => $this->progression->xpForLevel((int) $p->level),
            'xpNextLevel' => $this->progression->xpForLevel((int) $p->level + 1),
            'balance' => (int) $p->vmru_balance,
            'selectedVehicle' => $p->selected_vehicle,
            'vehicles' => $vehicles,
            // Free paints are always available (also to accounts created before a colour was added).
            'cosmetics' => $p->cosmetics->pluck('code')->merge(Cosmetic::where('type', 'paint')->where('price', 0)->pluck('code'))->unique()->values(),
            'racesPlayed' => (int) $p->races_played,
            'wins' => (int) $p->wins,
        ];
    }
}
