<?php

namespace App\Http\Controllers;

use App\Models\Cosmetic;
use App\Models\PlayerProfile;
use App\Services\ProfilePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(private readonly ProfilePresenter $presenter) {}

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->forceFill(['last_seen_at' => now()])->save();

        return response()->json(['profile' => $this->presenter->present($user->profile)]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'min:2', 'max:16', 'regex:/^[\pL\pN _\-\.]+$/u']]);
        /** @var PlayerProfile $profile */
        $profile = $request->user()->profile;
        $profile->display_name = trim($data['name']);
        $profile->save();
        $request->user()->forceFill(['name' => $profile->display_name])->save();

        return response()->json(['profile' => $this->presenter->present($profile->fresh())]);
    }

    public function catalog(): JsonResponse
    {
        $paints = Cosmetic::where('type', 'paint')->orderBy('sort')->get()->map(fn ($c) => [
            'code' => $c->code,
            'name' => $c->name,
            'hex' => $c->hex,
            'premium' => $c->price > 0,
            'price' => $c->price,
        ]);

        return response()->json([
            'paints' => $paints,
            'upgradeCosts' => config('racerush.upgrade_costs'),
            'maxUpgradeLevel' => config('racerush.max_upgrade_level'),
            'comingSoon' => config('racerush.coming_soon'),
            'tracks' => collect(config('racerush.tracks'))->map(fn ($t, $code) => ['code' => $code, 'name' => $t['name']])->values(),
        ]);
    }
}
