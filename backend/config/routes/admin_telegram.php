<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;

return static function (Router $router): void {
    $router->get('/api/v1/admin/telegram/chats', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['admin', 'moderator'])) return;

        $db = \Medbiohim\Database\Connection::pdo();
        $stmt = $db->query(
            'SELECT c.*, g.name AS group_name, g.code AS group_code
             FROM public.telegram_bot_chats c
             LEFT JOIN public.groups g ON g.id = c.group_id
             ORDER BY c.created_at DESC'
        );
        Response::success(['items' => $stmt->fetchAll() ?: []], $req->requestId);
    });

    $router->post('/api/v1/admin/telegram/chats/{chatId}/bind', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['admin', 'moderator'])) return;

        $groupId = trim((string) $req->json('group_id', ''));
        if ($groupId === '') {
            Response::error('VALIDATION_ERROR', 'group_id is required', $req->requestId, 422);
            return;
        }

        $db = \Medbiohim\Database\Connection::pdo();
        $check = $db->prepare('SELECT id FROM public.groups WHERE id = :id AND is_active = true');
        $check->execute(['id' => $groupId]);
        if ($check->fetchColumn() === false) {
            Response::error('NOT_FOUND', 'Group not found', $req->requestId, 404);
            return;
        }

        $stmt = $db->prepare(
            'UPDATE public.telegram_bot_chats
             SET group_id = :group_id, is_verified = true, updated_at = now()
             WHERE telegram_chat_id = :chat_id
             RETURNING *'
        );
        $stmt->execute(['group_id' => $groupId, 'chat_id' => (int) $params['chatId']]);
        $row = $stmt->fetch();
        if ($row === false) {
            Response::error('NOT_FOUND', 'Telegram chat has not been seen by the bot yet', $req->requestId, 404);
            return;
        }
        Response::success(['chat' => $row], $req->requestId);
    });

    $router->post('/api/v1/admin/telegram/set-webhook', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!RequireRole::handle($req, ['admin'])) return;

        $token = trim((string) (Env::get('TELEGRAM_BOT_TOKEN', '') ?? ''));
        $secret = trim((string) (Env::get('TELEGRAM_WEBHOOK_SECRET', '') ?? ''));
        $origin = rtrim((string) (Env::get('TELEGRAM_WEBHOOK_ORIGIN', '') ?? ''), '/');

        if ($token === '' || $origin === '') {
            Response::error('TELEGRAM_NOT_CONFIGURED', 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_ORIGIN', $req->requestId, 503);
            return;
        }

        $payload = [
            'url' => $origin . '/api/v1/telegram/webhook',
            'allowed_updates' => ['message', 'edited_message'],
        ];
        if ($secret !== '') $payload['secret_token'] = $secret;

        $api = 'https://api.telegram.org/bot' . rawurlencode($token) . '/setWebhook';
        $result = HttpClient::request('POST', $api, $payload, [], 20);
        if ($result['status'] < 200 || $result['status'] >= 300 || empty($result['json']['ok'])) {
            Response::error('TELEGRAM_WEBHOOK_FAILED', 'Telegram rejected webhook configuration', $req->requestId, 502);
            return;
        }

        Response::success([
            'configured' => true,
            'url' => $payload['url'],
            'telegram' => $result['json'],
        ], $req->requestId);
    });
};
