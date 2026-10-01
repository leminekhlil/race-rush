<?php

namespace Tests\Feature;

use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Illuminate\Support\Str;
use Tests\TestCase;

abstract class ApiTestCase extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    protected string $seeder = CatalogSeeder::class;

    /** @return array{token:string,profile:array} */
    protected function guest(string $name = 'Lemine'): array
    {
        return $this->postJson('/api/auth/guest', ['name' => $name])->assertCreated()->json();
    }

    protected function auth(string $token): static
    {
        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    protected function internal(string $method, string $path, array $body, ?string $secret = null, ?int $ts = null): TestResponse
    {
        $json = json_encode($body);
        $ts = $ts ?? time();
        $base = $ts.'.'.strtoupper($method).'.'.$path.'.'.hash('sha256', $json);
        $sig = hash_hmac('sha256', $base, $secret ?? config('racerush.realtime_secret'));

        return $this->call($method, $path, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_RR_TIMESTAMP' => (string) $ts,
            'HTTP_X_RR_SIGNATURE' => $sig,
        ], $json);
    }

    /** Starts a race with the given users (+ bots) and returns its uuid. */
    protected function startRace(array $userIds, int $bots = 0, string $track = 'city', int $laps = 3): string
    {
        $uuid = (string) Str::uuid();
        $players = [];
        $slot = 0;
        foreach ($userIds as $uid) {
            $players[] = ['slot' => $slot++, 'user_id' => (int) $uid, 'vehicle' => 'sport', 'color' => 'red'];
        }
        for ($i = 0; $i < $bots; $i++) {
            $players[] = ['slot' => $slot++, 'user_id' => null, 'bot_name' => "Bot$i", 'vehicle' => 'buggy', 'color' => 'blue'];
        }
        $this->internal('POST', '/api/internal/races', ['uuid' => $uuid, 'track' => $track, 'laps' => $laps, 'players' => $players])->assertOk();

        return $uuid;
    }
}
