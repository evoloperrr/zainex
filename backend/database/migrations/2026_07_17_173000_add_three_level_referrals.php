<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// ZAINEX_THREE_LEVEL_REFERRALS_V1

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'referral_code')) {
            Schema::table('users', function (Blueprint $table): void {
                $table
                    ->string('referral_code', 32)
                    ->nullable()
                    ->unique();
            });
        }

        if (! Schema::hasColumn('users', 'referred_at')) {
            Schema::table('users', function (Blueprint $table): void {
                $table
                    ->timestamp('referred_at')
                    ->nullable();
            });
        }

        DB::table('users')
            ->select([
                'id',
                'email',
                'referral_code',
            ])
            ->orderBy('id')
            ->chunkById(
                100,
                function ($users): void {
                    foreach ($users as $user) {
                        if (
                            trim(
                                (string)
                                    $user
                                        ->referral_code,
                            ) !== ''
                        ) {
                            continue;
                        }

                        DB::table('users')
                            ->where(
                                'id',
                                $user->id,
                            )
                            ->update([
                                'referral_code' =>
                                    $this
                                        ->referralCode(
                                            (int)
                                                $user
                                                    ->id,
                                            (string)
                                                $user
                                                    ->email,
                                        ),
                                'updated_at' => now(),
                            ]);
                    }
                },
                'id',
            );
    }

    public function down(): void
    {
        $hasCode =
            Schema::hasColumn(
                'users',
                'referral_code',
            );

        $hasReferredAt =
            Schema::hasColumn(
                'users',
                'referred_at',
            );

        if ($hasCode) {
            Schema::table(
                'users',
                function (Blueprint $table): void {
                    $table->dropUnique(
                        'users_referral_code_unique',
                    );

                    $table->dropColumn(
                        'referral_code',
                    );
                },
            );
        }

        if ($hasReferredAt) {
            Schema::table(
                'users',
                function (Blueprint $table): void {
                    $table->dropColumn(
                        'referred_at',
                    );
                },
            );
        }
    }

    private function referralCode(
        int $userId,
        string $email,
    ): string {
        return
            'ZX' .
            strtoupper(
                base_convert(
                    (string) $userId,
                    10,
                    36,
                ),
            ) .
            strtoupper(
                substr(
                    hash(
                        'sha256',
                        strtolower(
                            trim($email),
                        ),
                    ),
                    0,
                    8,
                ),
            );
    }
};