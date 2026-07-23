<?php

namespace App\Models;

// ZAINEX_DB_PHASE2A_COMBINED_USER_WALLET_INVITER_FUTURES_V2_4
// ZAINEX_ROOT_USER_LINKED_WALLET_AVATAR_V1
// ZAINEX_THREE_LEVEL_REFERRALS_V1

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'inviter_id', 'avatar_url', 'referral_code', 'referred_at', 'is_admin'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'referred_at' => 'datetime',
            'is_admin' => 'boolean',
            'wallet_balance' => 'decimal:8',
            'password' => 'hashed',
        ];
    }
    public function inviter(): BelongsTo
    {
        return $this->belongsTo(self::class, 'inviter_id');
    }

    public function invitees(): HasMany
    {
        return $this->hasMany(self::class, 'inviter_id');
    }

    public function tradingAccounts(): HasMany
    {
        return $this->hasMany(TradingAccount::class);
    }

    public function exchangeConnections(): HasMany
    {
        return $this->hasMany(ExchangeConnection::class);
    }
    public function isRoot(): bool
    {
        return $this->role === 'ROOT';
    }

    // ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1
    public function isAdmin(): bool
    {
        return $this->is_admin === true
            && in_array(
                $this->role,
                ['ROOT', 'ADMIN'],
                true,
            );
    }
}
