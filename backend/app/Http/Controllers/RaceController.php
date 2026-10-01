<?php

namespace App\Http\Controllers;

use App\Models\Race;
use App\Models\RaceResult;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RaceController extends Controller
{
    /** The caller's own result + rewards for a race (read-only). */
    public function myResult(Request $request, string $uuid): JsonResponse
    {
        $race = Race::where('uuid', $uuid)->firstOrFail();
        $result = RaceResult::where(['race_id' => $race->id, 'player_id' => $request->user()->profile->id])->first();
        if (! $result) {
            return response()->json(['error' => 'not_found'], 404);
        }

        return response()->json([
            'race' => ['uuid' => $race->uuid, 'track' => $race->track_code, 'laps' => $race->laps, 'status' => $race->status],
            'result' => [
                'position' => $result->position,
                'finished' => $result->finished,
                'timeMs' => $result->time_ms,
                'bestLapMs' => $result->best_lap_ms,
                'xp' => $result->xp_awarded,
                'vmru' => $result->vmru_awarded,
                'flagged' => $result->flagged,
            ],
        ]);
    }

    /** Best clean race times per track. */
    public function leaderboard(Request $request): JsonResponse
    {
        $track = (string) $request->query('track', 'city');
        if (! array_key_exists($track, config('racerush.tracks'))) {
            return response()->json(['error' => 'unknown_track'], 422);
        }
        $rows = DB::table('race_results')
            ->join('races', 'races.id', '=', 'race_results.race_id')
            ->join('player_profiles', 'player_profiles.id', '=', 'race_results.player_id')
            ->where('races.track_code', $track)
            ->where('race_results.finished', true)
            ->where('race_results.flagged', false)
            ->whereNotNull('race_results.best_lap_ms')
            ->groupBy('player_profiles.id', 'player_profiles.display_name')
            ->selectRaw('player_profiles.display_name as name, MIN(race_results.best_lap_ms) as best_lap_ms')
            ->orderBy('best_lap_ms')
            ->limit(20)
            ->get();

        return response()->json(['track' => $track, 'rows' => $rows]);
    }
}
