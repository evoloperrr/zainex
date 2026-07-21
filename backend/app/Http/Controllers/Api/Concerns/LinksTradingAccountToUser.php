<?php

// ZAINEX_TRADING_ACCOUNT_SELF_HEAL_LINK_V1

namespace App\Http\Controllers\Api\Concerns;

use Illuminate\Support\Facades\DB;

trait LinksTradingAccountToUser
{
    /**
     * The demo-session trading account is created anonymously
     * (user_id null) the first time a session trades. It only gets
     * linked to a real user at the moment of Google sign-in, via
     * the zainex-link redirect. If that cookie was already set
     * before signing in (or the link step was missed), the account
     * stays unlinked forever and user-scoped actions like strategy
     * activation fail. This self-heals the link on every request
     * that carries a verified session email, as long as doing so
     * would not collide with another account already owned by that
     * user.
     */
    private function linkAccountToUser(
        string $sessionId,
        ?string $email,
    ): void {
        $email = trim((string) $email);

        if ($email === '') {
            return;
        }

        $account = DB::table('trading_accounts')
            ->where('external_session_id', $sessionId)
            ->first();

        if ($account === null || $account->user_id !== null) {
            return;
        }

        $user = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [strtolower($email)])
            ->first();

        if ($user === null) {
            return;
        }

        $conflict = DB::table('trading_accounts')
            ->where('user_id', $user->id)
            ->where('id', '!=', $account->id)
            ->exists();

        if ($conflict) {
            return;
        }

        DB::table('trading_accounts')
            ->where('id', $account->id)
            ->update([
                'user_id' => $user->id,
                'updated_at' => now(),
            ]);
    }
}
