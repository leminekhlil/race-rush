<?php

namespace App\Services;

use App\Models\Cosmetic;
use App\Models\PlayerProfile;
use App\Models\PlayerVehicle;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PlayerProvisioner
{
    private const DEFAULT_PAINTS = ['sport' => 'red', 'moto' => 'blue', 'buggy' => 'yellow', 'monster' => 'white'];

    public function __construct(private readonly WalletService $wallet) {}

    public function createGuest(string $name): User
    {
        return DB::transaction(function () use ($name) {
            $user = User::create(['name' => $name, 'is_guest' => true, 'last_seen_at' => now()]);
            $this->provisionProfile($user, $name);
            Log::info('player.created', ['user_id' => $user->id, 'guest' => true]);

            return $user;
        });
    }

    public function provisionProfile(User $user, string $name): PlayerProfile
    {
        $profile = PlayerProfile::create(['user_id' => $user->id, 'display_name' => $name, 'selected_vehicle' => 'sport']);
        foreach (Vehicle::where('starter', true)->get() as $vehicle) {
            PlayerVehicle::create([
                'player_id' => $profile->id,
                'vehicle_id' => $vehicle->id,
                'paint_code' => self::DEFAULT_PAINTS[$vehicle->code] ?? 'red',
            ]);
        }
        $free = Cosmetic::where('type', 'paint')->where('price', 0)->pluck('id');
        $profile->cosmetics()->attach($free->mapWithKeys(fn ($id) => [$id => ['acquired_at' => now()]])->all());
        $this->wallet->credit($profile, (int) config('racerush.starter_vmru'), 'starter_bonus', 'welcome');

        return $profile;
    }
}
