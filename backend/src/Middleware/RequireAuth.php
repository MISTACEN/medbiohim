<?php
declare(strict_types=1);

namespace Medbiohim\Middleware;

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Services\SupabaseAuth;

final class RequireAuth
{
    public static function handle(Request $request): bool
    {
        $token = $request->bearerToken();
        if ($token === null || $token === '') {
            Response::error(
                'UNAUTHORIZED',
                'Missing or invalid Authorization Bearer token',
                $request->requestId,
                401
            );
            return false;
        }

        $auth = new SupabaseAuth();
        if (!$auth->isConfigured()) {
            Response::error(
                'AUTH_NOT_CONFIGURED',
                'Supabase Auth is not configured on the server',
                $request->requestId,
                503
            );
            return false;
        }

        $user = $auth->userFromAccessToken($token);
        if ($user === null) {
            Response::error(
                'UNAUTHORIZED',
                'Invalid or expired access token',
                $request->requestId,
                401
            );
            return false;
        }

        $request->user = $user;
        return true;
    }
}
