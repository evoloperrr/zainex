<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

// ZAINEX_THREE_LEVEL_REFERRALS_V1

final class ReferralNetworkController extends Controller
{
    use LinksTradingAccountToUser;

    private const MAX_DEPTH = 3;

    public function __invoke(
        Request $request,
    ): JsonResponse {
        $expectedToken = trim(
            (string)
                Config::get(
                    'intelibrain.internal_token',
                    '',
                ),
        );

        $providedToken = trim(
            (string)
                $request->header(
                    'X-Zainex-Internal-Token',
                    '',
                ),
        );

        if (
            $expectedToken === '' ||
            $providedToken === '' ||
            ! hash_equals(
                $expectedToken,
                $providedToken,
            )
        ) {
            return $this->error(
                401,
                'REFERRAL_UNAUTHORIZED',
                'Unauthorized referral network request.',
            );
        }

        $sessionId = trim(
            (string)
                $request->header(
                    'X-Zainex-Session-Id',
                    '',
                ),
        );

        if (
            ! preg_match(
                '/\A[a-f0-9-]{36}\z/i',
                $sessionId,
            )
        ) {
            return $this->error(
                422,
                'INVALID_SESSION',
                'A valid ZAINEX session is required.',
            );
        }

        $this->linkAccountToUser(
            $sessionId,
            $request->header('X-Zainex-User-Email'),
        );

        $currentUser = DB::table(
            'trading_accounts as account',
        )
            ->join(
                'users as user',
                'user.id',
                '=',
                'account.user_id',
            )
            ->where(
                'account.external_session_id',
                $sessionId,
            )
            ->where(
                'account.status',
                'ACTIVE',
            )
            ->select([
                'user.id',
                'user.name',
                'user.email',
                'user.inviter_id',
                'user.referral_code',
                'user.created_at',
            ])
            ->first();

        if ($currentUser === null) {
            return $this->error(
                404,
                'REFERRAL_ACCOUNT_NOT_FOUND',
                'The referral account could not be resolved.',
            );
        }

        $levels = [];
        $parentIds = [
            (int) $currentUser->id,
        ];

        for (
            $level = 1;
            $level <= self::MAX_DEPTH;
            $level++
        ) {
            if ($parentIds === []) {
                $members = collect();
            }
            else {
                $members = DB::table('users')
                    ->whereIn(
                        'inviter_id',
                        $parentIds,
                    )
                    ->orderBy('created_at')
                    ->orderBy('id')
                    ->get([
                        'id',
                        'name',
                        'email',
                        'inviter_id',
                        'created_at',
                    ]);
            }

            $levels[] = [
                'level' => $level,
                'count' => $members->count(),
                'members' =>
                    $this->members(
                        $members,
                    ),
            ];

            $parentIds = $members
                ->pluck('id')
                ->map(
                    fn ($id): int =>
                        (int) $id,
                )
                ->values()
                ->all();
        }

        $inviter = null;

        if (
            $currentUser->inviter_id !==
            null
        ) {
            $row = DB::table('users')
                ->where(
                    'id',
                    $currentUser
                        ->inviter_id,
                )
                ->first([
                    'id',
                    'name',
                    'email',
                ]);

            if ($row !== null) {
                $inviter = [
                    'id' => (int) $row->id,
                    'name' =>
                        (string) $row->name,
                    'email' =>
                        $this->maskedEmail(
                            (string)
                                $row->email,
                        ),
                ];
            }
        }

        $totalMembers =
            array_sum(
                array_map(
                    fn (array $level): int =>
                        (int)
                            $level['count'],
                    $levels,
                ),
            );

        return response()
            ->json([
                'ok' => true,
                'mode' =>
                    'three-level-referral',
                'maxDepth' =>
                    self::MAX_DEPTH,
                'levelFourIncluded' =>
                    false,
                'currentUser' => [
                    'id' =>
                        (int)
                            $currentUser->id,
                    'name' =>
                        (string)
                            $currentUser->name,
                    'email' =>
                        (string)
                            $currentUser->email,
                ],
                'referralCode' =>
                    (string)
                        $currentUser
                            ->referral_code,
                'invitePath' =>
                    '/auth?ref=' .
                    rawurlencode(
                        (string)
                            $currentUser
                                ->referral_code,
                    ),
                'inviter' => $inviter,
                'totalMembers' =>
                    $totalMembers,
                'levels' => $levels,
                'strategyIncomeReport' =>
                    $this->strategyIncomeReport(
                        (int) $currentUser->id,
                    ),
                'creditIncomeReport' =>
                    $this->creditIncomeReport(
                        (int) $currentUser->id,
                    ),
            ])
            ->header(
                'Cache-Control',
                'no-store',
            );
    }

    /**
     * @return array<string, mixed>
     */
    private function creditIncomeReport(
        int $userId,
    ): array {
        $baseQuery = DB::table(
            'referral_rewards',
        )
            ->where(
                'beneficiary_user_id',
                $userId,
            )
            ->where(
                'source_type',
                'STRATEGY_ACTIVATION',
            )
            ->whereNull('reversed_at');

        $totalEarned = BigDecimal::of(
            (string) ((clone $baseQuery)->sum('reward_credits') ?? 0),
        )->toScale(8, RoundingMode::Down);

        $balance = BigDecimal::of(
            (string) (
                DB::table('users')
                    ->where('id', $userId)
                    ->value('referral_credit_balance') ?? 0
            ),
        )->toScale(8, RoundingMode::Down);

        $recent = DB::table(
            'referral_rewards as reward',
        )
            ->leftJoin(
                'users as source_user',
                'source_user.id',
                '=',
                'reward.source_user_id',
            )
            ->where(
                'reward.beneficiary_user_id',
                $userId,
            )
            ->where(
                'reward.source_type',
                'STRATEGY_ACTIVATION',
            )
            ->whereNull('reward.reversed_at')
            ->orderByDesc('reward.occurred_at')
            ->orderByDesc('reward.id')
            ->limit(10)
            ->get([
                'reward.id',
                'reward.level',
                'reward.rate_bps',
                'reward.base_credits',
                'reward.reward_credits',
                'reward.balance_after',
                'reward.source_type',
                'reward.occurred_at',
                'source_user.id as source_user_id',
                'source_user.name as source_user_name',
                'source_user.email as source_user_email',
            ])
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'sourceUser' => $row->source_user_id === null
                    ? null
                    : [
                        'id' => (int) $row->source_user_id,
                        'name' => (string) $row->source_user_name,
                        'email' => $this->maskedEmail(
                            (string) $row->source_user_email,
                        ),
                    ],
                'level' => (int) $row->level,
                'percentage' => (float) $row->rate_bps / 100,
                'baseCredits' => (float) $row->base_credits,
                'rewardCredits' => (float) $row->reward_credits,
                'balanceAfter' => (float) $row->balance_after,
                'sourceType' => (string) $row->source_type,
                'creditedAt' => $row->occurred_at,
            ])
            ->values()
            ->all();

        $configuredRates = (array) config(
            'referral_rewards.level_rates_bps',
            [],
        );

        return [
            'balance' => (float) (string) $balance,
            'totalEarned' => (float) (string) $totalEarned,
            'rewardCount' => (clone $baseQuery)->count(),
            'rates' => [
                'level1' => (int) ($configuredRates[1] ?? 0) / 100,
                'level2' => (int) ($configuredRates[2] ?? 0) / 100,
                'level3' => (int) ($configuredRates[3] ?? 0) / 100,
            ],
            'recent' => $recent,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function strategyIncomeReport(
        int $userId,
    ): array {
        $baseQuery = DB::table(
            'wallet_transactions',
        )
            ->where('user_id', $userId)
            ->where(
                'event_type',
                'STRATEGY_REFERRAL_INCOME',
            );

        $totalIncome = BigDecimal::of(
            (string) ((clone $baseQuery)->sum('amount') ?? 0),
        )->toScale(8, RoundingMode::Down);

        $recent = DB::table(
            'wallet_transactions as income',
        )
            ->leftJoin(
                'strategy_activations as activation',
                'activation.id',
                '=',
                'income.strategy_activation_id',
            )
            ->leftJoin(
                'users as source_user',
                'source_user.id',
                '=',
                'activation.user_id',
            )
            ->where('income.user_id', $userId)
            ->where(
                'income.event_type',
                'STRATEGY_REFERRAL_INCOME',
            )
            ->orderByDesc('income.occurred_at')
            ->orderByDesc('income.id')
            ->limit(10)
            ->get([
                'income.id',
                'income.strategy_activation_id',
                'income.amount',
                'income.wallet_balance_after',
                'income.metadata',
                'income.occurred_at',
                'activation.tier',
                'activation.allocated_amount',
                'source_user.id as source_user_id',
                'source_user.name as source_user_name',
                'source_user.email as source_user_email',
            ])
            ->map(function (object $row): array {
                $metadata = [];

                if (
                    is_string($row->metadata) &&
                    $row->metadata !== ''
                ) {
                    $decoded = json_decode(
                        $row->metadata,
                        true,
                    );

                    if (is_array($decoded)) {
                        $metadata = $decoded;
                    }
                }

                $sourceAmount = $metadata['tradingAmount'] ??
                    $row->allocated_amount ??
                    0;

                $percentage = $metadata['percentage'] ??
                    (int) config(
                        'referral_rewards.strategy_trading_amount_rate_bps',
                        1000,
                    ) / 100;

                return [
                    'id' => (int) $row->id,
                    'activationId' => $row->strategy_activation_id === null
                        ? null
                        : (int) $row->strategy_activation_id,
                    'sourceUser' => $row->source_user_id === null
                        ? null
                        : [
                            'id' => (int) $row->source_user_id,
                            'name' => (string) $row->source_user_name,
                            'email' => $this->maskedEmail(
                                (string) $row->source_user_email,
                            ),
                        ],
                    'tier' => $row->tier === null
                        ? null
                        : (string) $row->tier,
                    'tradingAmount' => (float) $sourceAmount,
                    'percentage' => (float) $percentage,
                    'incomeAmount' => (float) $row->amount,
                    'walletBalanceAfter' => (float)
                        $row->wallet_balance_after,
                    'creditedAt' => $row->occurred_at,
                ];
            })
            ->values()
            ->all();

        return [
            'ratePercentage' => (int) config(
                'referral_rewards.strategy_trading_amount_rate_bps',
                1000,
            ) / 100,
            'totalIncome' => (float) (string) $totalIncome,
            'creditedActivations' => (clone $baseQuery)->count(),
            'currency' => 'USDT',
            'recent' => $recent,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function members(
        Collection $members,
    ): array {
        return $members
            ->map(
                fn (object $member): array => [
                    'id' =>
                        (int) $member->id,
                    'name' =>
                        (string)
                            $member->name,
                    'email' =>
                        $this->maskedEmail(
                            (string)
                                $member->email,
                        ),
                    'inviterId' =>
                        (int)
                            $member
                                ->inviter_id,
                    'joinedAt' =>
                        $member->created_at,
                ],
            )
            ->values()
            ->all();
    }

    private function maskedEmail(
        string $email,
    ): string {
        [$local, $domain] =
            array_pad(
                explode(
                    '@',
                    $email,
                    2,
                ),
                2,
                '',
            );

        if (
            $local === '' ||
            $domain === ''
        ) {
            return '';
        }

        $visible =
            mb_substr(
                $local,
                0,
                2,
            );

        return
            $visible .
            str_repeat(
                '*',
                max(
                    2,
                    mb_strlen($local) - 2,
                ),
            ) .
            '@' .
            $domain;
    }

    private function error(
        int $status,
        string $code,
        string $message,
    ): JsonResponse {
        return response()
            ->json(
                [
                    'ok' => false,
                    'error' => [
                        'code' => $code,
                        'message' => $message,
                    ],
                ],
                $status,
            )
            ->header(
                'Cache-Control',
                'no-store',
            );
    }
}
