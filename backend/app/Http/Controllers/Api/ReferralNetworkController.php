<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
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
            ])
            ->header(
                'Cache-Control',
                'no-store',
            );
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