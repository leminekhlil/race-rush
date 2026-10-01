<?php

namespace Database\Seeders;

use App\Models\Cosmetic;
use App\Models\Vehicle;
use Illuminate\Database\Seeder;

/** Reference data (vehicles, paints, upcoming cosmetics) from config/racerush.php. Idempotent. */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        foreach (config('racerush.vehicles') as $code => $v) {
            Vehicle::updateOrCreate(['code' => $code], [
                'name' => $v['name'],
                'stat_speed' => $v['speed'],
                'stat_accel' => $v['accel'],
                'stat_handling' => $v['handling'],
                'stat_stability' => $v['stability'],
                'price' => 0,
                'starter' => true,
                'sort' => $v['sort'],
            ]);
        }
        foreach (config('racerush.paints') as $i => $p) {
            Cosmetic::updateOrCreate(['code' => $p['code']], [
                'type' => 'paint',
                'name' => $p['name'],
                'hex' => $p['hex'],
                'price' => $p['price'],
                'available' => true,
                'sort' => $i,
            ]);
        }
        foreach (config('racerush.coming_soon') as $i => $c) {
            Cosmetic::updateOrCreate(['code' => $c['code']], [
                'type' => $c['type'],
                'name' => $c['name'],
                'price' => 0,
                'available' => false,
                'sort' => 100 + $i,
            ]);
        }
    }
}
