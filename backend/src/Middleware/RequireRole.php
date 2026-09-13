<?php
declare(strict_types=1);

namespace Medbiohim\Middleware;

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Repositories\UserRepository;

final class RequireRole
{
    /** @param list<string> $allowed */
    public static function handle(Request $request, array $allowed): bool
    {
        if ($request->user === null) {
            Response::error('UNAUTHORIZED', 'Authentication required', $request->requestId, 401);
            return false;
        }

        $jwtRole = $request->user->role;
        if ($jwtRole !== null && in_array($jwtRole, $allowed, true)) {
            return true;
        }

        try {
            $repo = new UserRepository();
            $roles = $repo->roleCodesForUser($request->user->id);
            foreach ($roles as $code) {
                if (in_array($code, $allowed, true)) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            // DB optional when JWT role present
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
