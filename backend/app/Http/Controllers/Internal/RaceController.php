<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Models\Lobby;
use App\Models\PlayerProfile;
use App\Services\RaceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/** Server-to-server endpoints called by the realtime server (HMAC-signed). */
class RaceController extends Controller
{
    public function __construct(private readonly RaceService $races) {}

    public function upsertLobby(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'alpha_num', 'size:4'],
            'host_user_id' => ['nullable', 'integer'],
            'track' => ['required', Rule::in(array_keys(config('racerush.tracks')))],
            'laps' => ['required', 'integer', 'min:1', 'max:'.config('racerush.max_laps')],
            'status' => ['required', Rule::in(['WAITING', 'READY', 'COUNTDOWN', 'RACING', 'FINISHED', 'CLOSED'])],
            'bot_fill' => ['required', 'boolean'],
            'solo' => ['required', 'boolean'],
            'max_players' => ['required', 'integer', 'min:1', 'max:5'],
            'user_ids' => ['array', 'max:5'],
            'user_ids.*' => ['integer'],
        ]);
        $lobby = DB::transaction(function () use ($data) {
            $hostId = $data['host_user_id'] ? PlayerProfile::where('user_id', $data['host_user_id'])->value('id') : null;
            $lobby = Lobby::where('code', $data['code'])->where('status', '!=', 'CLOSED')->latest('id')->first()
                ?? new Lobby(['code' => $data['code']]);
            $isNew = ! $lobby->exists;
            $lobby->fill([
                'host_player_id' => $hostId,
                'track_code' => $data['track'],
                'laps' => $data['laps'],
                'status' => $data['status'],
                'bot_fill' => $data['bot_fill'],
                'solo' => $data['solo'],
                'max_players' => $data['max_players'],
                'closed_at' => $data['status'] === 'CLOSED' ? now() : null,
            ])->save();
            $profileIds = PlayerProfile::whereIn('user_id', $data['user_ids'] ?? [])->pluck('id')->all();
            $existing = DB::table('lobby_players')->where('lobby_id', $lobby->id)->pluck('player_id')->all();
            foreach (array_diff($profileIds, $existing) as $pid) {
                DB::table('lobby_players')->insert(['lobby_id' => $lobby->id, 'player_id' => $pid, 'joined_at' => now()]);
            }
            DB::table('lobby_players')->where('lobby_id', $lobby->id)->whereNotIn('player_id', $profileIds ?: [0])->whereNull('left_at')->update(['left_at' => now()]);
            DB::table('lobby_players')->where('lobby_id', $lobby->id)->whereIn('player_id', $profileIds ?: [0])->update(['left_at' => null]);
            if ($isNew) {
                Log::info('lobby.created', ['code' => $lobby->code, 'solo' => $lobby->solo]);
            }

            return $lobby;
        });

        return response()->json(['id' => $lobby->id]);
    }

    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'uuid' => ['required', 'uuid'],
            'lobby_code' => ['nullable', 'string', 'size:4'],
            'track' => ['required', Rule::in(array_keys(config('racerush.tracks')))],
            'laps' => ['required', 'integer', 'min:1', 'max:'.config('racerush.max_laps')],
            'players' => ['required', 'array', 'min:1', 'max:5'],
            'players.*.slot' => ['required', 'integer', 'min:0', 'max:4', 'distinct'],
            'players.*.user_id' => ['nullable', 'integer'],
            'players.*.bot_name' => ['nullable', 'string', 'max:24'],
            'players.*.vehicle' => ['required', Rule::in(array_keys(config('racerush.vehicles')))],
            'players.*.color' => ['required', 'string', 'max:24'],
        ]);
        if (! empty($data['lobby_code'])) {
            $data['lobby_id'] = Lobby::where('code', $data['lobby_code'])->latest('id')->value('id');
        }
        $race = $this->races->start($data);

        return response()->json(['uuid' => $race->uuid, 'id' => $race->id]);
    }

    public function finish(Request $request, string $uuid): JsonResponse
    {
        $data = $request->validate([
            'results' => ['required', 'array', 'min:1', 'max:5'],
            'results.*.slot' => ['required', 'integer', 'min:0', 'max:4'],
            'results.*.position' => ['required', 'integer', 'min:1', 'max:5'],
            'results.*.finished' => ['required', 'boolean'],
            'results.*.time_ms' => ['nullable', 'integer', 'min:0', 'max:3600000'],
            'results.*.best_lap_ms' => ['nullable', 'integer', 'min:0', 'max:3600000'],
            'results.*.flagged' => ['sometimes', 'boolean'],
            'results.*.anomalies' => ['sometimes', 'array', 'max:20'],
            'results.*.anomalies.*.kind' => ['required', 'string', 'max:32'],
            'results.*.anomalies.*.detail' => ['required', 'string', 'max:255'],
        ]);
        $rewards = $this->races->finish($uuid, $data['results']);

        return response()->json(['uuid' => $uuid, 'rewards' => (object) $rewards]);
    }

    public function anomaly(Request $request): JsonResponse
    {
        $data = $request->validate([
            'race_uuid' => ['nullable', 'uuid'],
            'user_id' => ['nullable', 'integer'],
            'kind' => ['required', 'string', 'max:32'],
            'detail' => ['required', 'string', 'max:255'],
        ]);
        $raceId = $data['race_uuid'] ? \App\Models\Race::where('uuid', $data['race_uuid'])->value('id') : null;
        $playerId = $data['user_id'] ? PlayerProfile::where('user_id', $data['user_id'])->value('id') : null;
        $this->races->anomaly($raceId, $playerId, $data['kind'], $data['detail']);

        return response()->json(['ok' => true]);
    }
}
