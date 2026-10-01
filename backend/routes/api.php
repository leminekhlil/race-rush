<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\GarageController;
use App\Http\Controllers\Internal\RaceController as InternalRaceController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\RaceController;
use App\Http\Controllers\RealtimeController;
use App\Http\Middleware\VerifyInternalSignature;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['ok' => true, 'service' => 'race-rush-api', 'time' => now()->toIso8601String()]));
Route::get('/catalog', [ProfileController::class, 'catalog'])->middleware('throttle:api');

Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/guest', [AuthController::class, 'guest']);
    Route::post('/auth/login', [AuthController::class, 'login']);
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', [ProfileController::class, 'me']);
    Route::patch('/me', [ProfileController::class, 'update']);
    Route::post('/realtime/ticket', [RealtimeController::class, 'ticket']);
    Route::get('/races/{uuid}/result', [RaceController::class, 'myResult'])->whereUuid('uuid');
    Route::get('/leaderboard', [RaceController::class, 'leaderboard']);

    Route::middleware('throttle:shop')->group(function () {
        Route::post('/garage/select', [GarageController::class, 'select']);
        Route::post('/garage/paint', [GarageController::class, 'paint']);
        Route::post('/garage/upgrade', [GarageController::class, 'upgrade']);
        Route::post('/garage/cosmetics/{code}/purchase', [GarageController::class, 'purchase'])->where('code', '[a-z0-9_]{2,32}');
    });
});

// Server-to-server (realtime server → API). Never callable with a player token.
Route::prefix('internal')->middleware([VerifyInternalSignature::class, 'throttle:internal'])->group(function () {
    Route::post('/lobbies', [InternalRaceController::class, 'upsertLobby']);
    Route::post('/races', [InternalRaceController::class, 'start']);
    Route::post('/races/{uuid}/finish', [InternalRaceController::class, 'finish'])->whereUuid('uuid');
    Route::post('/anomalies', [InternalRaceController::class, 'anomaly']);
});
