<?php

namespace App\Http\Controllers;

use App\Services\TicketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RealtimeController extends Controller
{
    public function ticket(Request $request, TicketService $tickets): JsonResponse
    {
        $issued = $tickets->issue($request->user()->profile);

        return response()->json($issued + ['url' => config('racerush.realtime_url')]);
    }
}
