<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Fourth upgrade line from the garage reference: Freinage (brakes). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicle_upgrades', function (Blueprint $table) {
            $table->enum('stat', ['engine', 'handling', 'boost', 'brakes'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('vehicle_upgrades', function (Blueprint $table) {
            $table->enum('stat', ['engine', 'handling', 'boost'])->change();
        });
    }
};
