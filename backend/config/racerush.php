<?php

/*
|--------------------------------------------------------------------------
| Race Rush — server-side game economy
|--------------------------------------------------------------------------
| The server is the only authority for XP, levels, v-MRU, ownership and upgrades.
| v-MRU is a virtual in-game currency only: no real-money conversion, no withdrawal.
*/

return [
    'realtime_secret' => env('RACERUSH_REALTIME_SECRET', ''),
    'ticket_ttl' => (int) env('RACERUSH_TICKET_TTL', 900),
    'realtime_url' => env('RACERUSH_REALTIME_URL', '/ws'),
    // Max clock skew accepted on signed internal calls (seconds).
    'internal_max_skew' => 60,

    'starter_vmru' => 500,

    'vehicles' => [
        'sport' => ['name' => 'Sport Car', 'speed' => 9, 'accel' => 8, 'handling' => 8, 'stability' => 6, 'sort' => 1],
        'moto' => ['name' => 'Motorcycle', 'speed' => 8, 'accel' => 9, 'handling' => 10, 'stability' => 3, 'sort' => 2],
        'buggy' => ['name' => 'Buggy', 'speed' => 7, 'accel' => 7, 'handling' => 7, 'stability' => 8, 'sort' => 3],
        'monster' => ['name' => 'Monster Truck', 'speed' => 6, 'accel' => 5, 'handling' => 5, 'stability' => 10, 'sort' => 4],
    ],

    // Garage reference order: Moteur, Turbo, Freinage, Maniabilité.
    'upgrade_stats' => ['engine', 'boost', 'brakes', 'handling'],
    'max_upgrade_level' => 5,
    // Cost (v-MRU) to reach level N (index 0 => level 1).
    'upgrade_costs' => [150, 300, 500, 800, 1200],

    // Standard colours (free) match the garage reference swatches; premium paints cost v-MRU.
    'paints' => [
        ['code' => 'red', 'name' => 'Rouge', 'hex' => '#e3262f', 'price' => 0],
        ['code' => 'blue', 'name' => 'Bleu', 'hex' => '#1f6bff', 'price' => 0],
        ['code' => 'white', 'name' => 'Blanc', 'hex' => '#eef1f6', 'price' => 0],
        ['code' => 'black', 'name' => 'Noir', 'hex' => '#1b1d24', 'price' => 0],
        ['code' => 'yellow', 'name' => 'Jaune', 'hex' => '#ffc61a', 'price' => 0],
        ['code' => 'violet', 'name' => 'Violet', 'hex' => '#8a3dff', 'price' => 0],
        ['code' => 'green', 'name' => 'Vert', 'hex' => '#2ecc40', 'price' => 0],
        ['code' => 'orange', 'name' => 'Orange', 'hex' => '#ff7a1a', 'price' => 0],
        ['code' => 'gold', 'name' => 'Or Champion', 'hex' => '#d9a521', 'price' => 900],
        ['code' => 'neon', 'name' => 'Néon Cyan', 'hex' => '#14e1ff', 'price' => 600],
    ],

    // Prepared customization categories (locked in the MVP).
    'coming_soon' => [
        ['code' => 'sticker_flames', 'type' => 'sticker', 'name' => 'Stickers Flammes'],
        ['code' => 'pattern_carbon', 'type' => 'pattern', 'name' => 'Motif Carbone'],
        ['code' => 'wheels_neon', 'type' => 'wheels', 'name' => 'Jantes Néon'],
        ['code' => 'boost_violet', 'type' => 'boost_fx', 'name' => 'Boost Violet'],
    ],

    'tracks' => [
        // min_lap: fastest physically possible lap (s) with the fastest fully upgraded vehicle.
        'city' => ['name' => 'City — Neon Boulevard', 'min_lap' => 15.0],
        'desert' => ['name' => 'Desert — Dune Canyon', 'min_lap' => 12.5],
    ],
    'max_laps' => 5,

    'rewards' => [
        'finish_xp' => 60,
        'position_xp' => [120, 85, 60, 40, 25],
        'dnf_xp' => 15,
        'finish_vmru' => 30,
        'position_vmru' => [150, 100, 70, 45, 30],
        'dnf_vmru' => 5,
        // Extra multiplier per human opponent beaten (encourages multiplayer).
        'per_human_opponent' => 0.1,
    ],

    // XP needed to go from level N to N+1 = base + (N - 1) * step.
    'level_curve' => ['base' => 200, 'step' => 120, 'max_level' => 99],
];
