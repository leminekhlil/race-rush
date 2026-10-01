<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('display_name', 24);
            $table->unsignedInteger('level')->default(1);
            $table->unsignedBigInteger('xp')->default(0);
            // Cached balance, always updated in the same DB transaction as a wallet_transactions row.
            $table->unsignedBigInteger('vmru_balance')->default(0);
            $table->string('selected_vehicle', 16)->default('sport');
            $table->unsignedInteger('races_played')->default(0);
            $table->unsignedInteger('wins')->default(0);
            $table->timestamps();
        });

        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('code', 16)->unique();
            $table->string('name', 40);
            $table->unsignedTinyInteger('stat_speed');
            $table->unsignedTinyInteger('stat_accel');
            $table->unsignedTinyInteger('stat_handling');
            $table->unsignedTinyInteger('stat_stability');
            $table->unsignedInteger('price')->default(0);
            $table->boolean('starter')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('player_vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained('player_profiles')->cascadeOnDelete();
            $table->foreignId('vehicle_id')->constrained('vehicles')->cascadeOnDelete();
            $table->string('paint_code', 24)->default('red');
            $table->timestamps();
            $table->unique(['player_id', 'vehicle_id']);
        });

        Schema::create('vehicle_upgrades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_vehicle_id')->constrained('player_vehicles')->cascadeOnDelete();
            $table->enum('stat', ['engine', 'handling', 'boost']);
            $table->unsignedTinyInteger('level')->default(0);
            $table->timestamps();
            $table->unique(['player_vehicle_id', 'stat']);
        });

        Schema::create('cosmetics', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->enum('type', ['paint', 'sticker', 'pattern', 'wheels', 'boost_fx']);
            $table->string('name', 40);
            $table->string('hex', 7)->nullable();
            $table->unsignedInteger('price')->default(0);
            $table->boolean('available')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('player_cosmetics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained('player_profiles')->cascadeOnDelete();
            $table->foreignId('cosmetic_id')->constrained('cosmetics')->cascadeOnDelete();
            $table->timestamp('acquired_at');
            $table->unique(['player_id', 'cosmetic_id']);
        });

        Schema::create('lobbies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 8)->index();
            $table->foreignId('host_player_id')->nullable()->constrained('player_profiles')->nullOnDelete();
            $table->string('track_code', 16);
            $table->unsignedTinyInteger('laps');
            $table->enum('status', ['WAITING', 'READY', 'COUNTDOWN', 'RACING', 'FINISHED', 'CLOSED'])->default('WAITING');
            $table->unsignedTinyInteger('max_players')->default(5);
            $table->boolean('bot_fill')->default(true);
            $table->boolean('solo')->default(false);
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('lobby_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lobby_id')->constrained('lobbies')->cascadeOnDelete();
            $table->foreignId('player_id')->constrained('player_profiles')->cascadeOnDelete();
            $table->timestamp('joined_at');
            $table->timestamp('left_at')->nullable();
            $table->unique(['lobby_id', 'player_id']);
        });

        Schema::create('races', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('lobby_id')->nullable()->constrained('lobbies')->nullOnDelete();
            $table->string('track_code', 16);
            $table->unsignedTinyInteger('laps');
            $table->enum('status', ['racing', 'finished', 'aborted'])->default('racing');
            $table->unsignedTinyInteger('human_count')->default(0);
            $table->unsignedTinyInteger('bot_count')->default(0);
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('race_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('race_id')->constrained('races')->cascadeOnDelete();
            $table->foreignId('player_id')->nullable()->constrained('player_profiles')->nullOnDelete();
            $table->string('bot_name', 24)->nullable();
            $table->string('vehicle_code', 16);
            $table->string('paint_code', 24);
            $table->unsignedTinyInteger('grid_slot');
            $table->timestamps();
            $table->unique(['race_id', 'grid_slot']);
            $table->unique(['race_id', 'player_id']);
        });

        Schema::create('race_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('race_id')->constrained('races')->cascadeOnDelete();
            $table->foreignId('race_player_id')->unique()->constrained('race_players')->cascadeOnDelete();
            $table->foreignId('player_id')->nullable()->constrained('player_profiles')->nullOnDelete();
            $table->unsignedTinyInteger('position');
            $table->boolean('finished');
            $table->unsignedInteger('time_ms')->nullable();
            $table->unsignedInteger('best_lap_ms')->nullable();
            $table->boolean('flagged')->default(false);
            $table->unsignedInteger('xp_awarded')->default(0);
            $table->unsignedInteger('vmru_awarded')->default(0);
            $table->timestamp('rewarded_at')->nullable();
            $table->timestamps();
            // A player can only ever have one result (and therefore one reward) per race.
            $table->unique(['race_id', 'player_id']);
            $table->index(['player_id', 'created_at']);
        });

        Schema::create('player_progression', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained('player_profiles')->cascadeOnDelete();
            $table->foreignId('race_id')->nullable()->constrained('races')->nullOnDelete();
            $table->integer('xp_delta');
            $table->unsignedBigInteger('xp_after');
            $table->unsignedInteger('level_before');
            $table->unsignedInteger('level_after');
            $table->string('reason', 32);
            $table->timestamp('created_at');
            $table->unique(['player_id', 'race_id', 'reason']);
        });

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained('player_profiles')->cascadeOnDelete();
            $table->enum('type', ['credit', 'debit']);
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('balance_after');
            $table->string('source', 32);
            $table->string('reference', 64);
            $table->json('meta')->nullable();
            $table->timestamp('created_at');
            // Idempotency: the same business event can never be booked twice.
            $table->unique(['player_id', 'source', 'reference']);
        });

        Schema::create('race_anomalies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('race_id')->nullable()->constrained('races')->nullOnDelete();
            $table->foreignId('player_id')->nullable()->constrained('player_profiles')->nullOnDelete();
            $table->string('kind', 32);
            $table->string('detail', 255);
            $table->timestamp('created_at');
        });
    }

    public function down(): void
    {
        foreach (['race_anomalies', 'wallet_transactions', 'player_progression', 'race_results', 'race_players', 'races', 'lobby_players', 'lobbies', 'player_cosmetics', 'cosmetics', 'vehicle_upgrades', 'player_vehicles', 'vehicles', 'player_profiles'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
