<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\PlayerProvisioner;
use App\Services\ProfilePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly PlayerProvisioner $provisioner,
        private readonly ProfilePresenter $presenter,
    ) {}

    /** Instant guest account: lowest-friction way to play on mobile. */
    public function guest(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'min:2', 'max:16', 'regex:/^[\pL\pN _\-\.]+$/u']]);
        $user = $this->provisioner->createGuest(trim($data['name']));
        $token = $user->createToken('device')->plainTextToken;
        Log::info('auth.guest', ['user_id' => $user->id]);

        return response()->json(['token' => $token, 'profile' => $this->presenter->present($user->profile)], 201);
    }

    /** Turns the current guest into a permanent account (keeps progression). */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:120', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:72'],
        ]);
        /** @var User $user */
        $user = $request->user();
        DB::transaction(function () use ($user, $data) {
            $user->email = strtolower($data['email']);
            $user->password = $data['password'];
            $user->is_guest = false;
            $user->save();
        });
        Log::info('auth.registered', ['user_id' => $user->id]);

        return response()->json(['profile' => $this->presenter->present($user->profile)]);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string', 'max:72']]);
        $user = User::where('email', strtolower($data['email']))->first();
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            Log::notice('auth.login_failed', ['ip' => $request->ip()]);
            throw ValidationException::withMessages(['email' => 'Identifiants invalides.']);
        }
        $token = $user->createToken('device')->plainTextToken;
        Log::info('auth.login', ['user_id' => $user->id]);

        return response()->json(['token' => $token, 'profile' => $this->presenter->present($user->profile)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }
}
