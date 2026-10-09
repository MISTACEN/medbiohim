<?php
declare(strict_types=1);

namespace Medbiohim\Middleware;

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Support\Logger;

final class RequireRole
{
    /** @param list<string> $allowed */
    public static function handle(Request $request, array $allowed): bool
    {
        if ($request->user === null) {
            Response::error('UNAUTHORIZED', 'Authentication required', $request->requestId, 401);
            return false;
        }

        // user_roles is the authorization source of truth. Never authorize privileged
        // requests solely from claims cached in an access token, which may be stale.
        try {
            $roles = (new UserRepository())->roleCodesForUser($request->user->id);
        } catch (\Throwable $e) {
            Logger::error('role_check_unavailable', [
                'requestId' => $request->requestId,
                'userId' => $request->user->id,
                'error' => $e->getMessage(),
            ]);
            Response::error(
                'ROLE_CHECK_UNAVAILABLE',
                'Проверка прав временно недоступна',
                $request->requestId,
                503
            );
            return false;
        }

        foreach ($roles as $code) {
            if (in_array($code, $allowed, true)) {
                return true;
            }
        }

        Response::error(
            'FORBIDDEN',
            'Insufficient role',
            $request->requestId,
            403,
            ['required' => $allowed]
        );
        return false;
    }
}
