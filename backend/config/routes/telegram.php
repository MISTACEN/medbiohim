<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Services\TelegramHomeworkService;

return static function (Router $router): void {
    $router->post('/api/v1/telegram/webhook', static function (Request $req, array $params): void {
        $service = new TelegramHomeworkService();
        $secret = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? null;

        if (!$service->webhookSecretMatches($secret)) {
            Response::error('FORBIDDEN', 'Invalid Telegram webhook secret', $req->requestId, 403);
            return;
        }

        if (!$service->configured()) {
            Response::error('TELEGRAM_NOT_CONFIGURED', 'Telegram bot environment is not configured', $req->requestId, 503);
            return;
        }

        $update = $req->jsonBody;
        if (!is_array($update)) {
            Response::error('VALIDATION_ERROR', 'Invalid Telegram update', $req->requestId, 422);
            return;
        }

        try {
            $result = $service->handleUpdate($update);
            Response::success($result, $req->requestId);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('telegram_webhook_failed', [
                'requestId' => $req->requestId,
                'error' => $e->getMessage(),
            ]);
            Response::error('TELEGRAM_PROCESSING_ERROR', 'Telegram update processing failed', $req->requestId, 500);
        }
    });

    $router->post('/api/v1/telegram/account-link/confirm', static function (Request $req, array $params): void {
        $service = new TelegramHomeworkService();
        $secret = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? null;
        if (!$service->webhookSecretMatches(is_string($secret) ? $secret : null)) {
            Response::error('FORBIDDEN', 'Invalid Telegram webhook secret', $req->requestId, 403);
            return;
        }
        $body = is_array($req->jsonBody) ? $req->jsonBody : [];
        $token = (string) ($body['token'] ?? '');
        $telegramId = (string) ($body['telegram_user_id'] ?? '');
        if (!preg_match('/^[a-f0-9]{64}$/', $token) || !preg_match('/^[1-9][0-9]{0,17}$/', $telegramId)) {
            Response::error('VALIDATION_ERROR', 'Invalid account-link confirmation', $req->requestId, 422);
            return;
        }
        $username = isset($body['username']) && is_string($body['username']) ? mb_substr(trim($body['username']), 0, 64) : null;
        $firstName = isset($body['first_name']) && is_string($body['first_name']) ? mb_substr(trim($body['first_name']), 0, 128) : null;
        $db = \\Medbiohim\\Database\\Connection::pdo();
        try {
            $db->beginTransaction();
            $q = $db->prepare("SELECT id, user_id FROM public.telegram_account_link_tokens WHERE token_hash = :hash AND consumed_at IS NULL AND expires_at > now() FOR UPDATE");
            $q->execute(['hash' => hash('sha256', $token)]);
            $link = $q->fetch(\\PDO::FETCH_ASSOC);
            if (!is_array($link)) {
                $db->rollBack();
                Response::error('LINK_TOKEN_INVALID', 'Ссылка истекла или уже использована. Создайте новую.', $req->requestId, 410);
                return;
            }
            $q = $db->prepare('SELECT telegram_user_id FROM public.telegram_accounts WHERE user_id = :uid LIMIT 1');
            $q->execute(['uid' => $link['user_id']]);
            $byUser = $q->fetchColumn();
            $q = $db->prepare('SELECT user_id FROM public.telegram_accounts WHERE telegram_user_id = :tid LIMIT 1');
            $q->execute(['tid' => $telegramId]);
            $byTelegram = $q->fetchColumn();
            if (($byUser !== false && (string) $byUser !== $telegramId) || ($byTelegram !== false && (string) $byTelegram !== (string) $link['user_id'])) {
                $db->rollBack();
                Response::error('TELEGRAM_ALREADY_LINKED', 'Один из аккаунтов уже связан с другим профилем.', $req->requestId, 409);
                return;
            }
            $q = $db->prepare("INSERT INTO public.telegram_accounts (telegram_user_id, user_id, username, first_name) VALUES (:tid, :uid, :username, :first_name) ON CONFLICT (telegram_user_id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name, updated_at = now() WHERE public.telegram_accounts.user_id = EXCLUDED.user_id");
            $q->execute(['tid' => $telegramId, 'uid' => $link['user_id'], 'username' => $username, 'first_name' => $firstName]);
            if ($q->rowCount() < 1) {
                $db->rollBack();
                Response::error('TELEGRAM_ALREADY_LINKED', 'Не удалось безопасно связать аккаунты.', $req->requestId, 409);
                return;
            }
            $q = $db->prepare('UPDATE public.telegram_account_link_tokens SET consumed_at = now() WHERE id = :id AND consumed_at IS NULL');
            $q->execute(['id' => $link['id']]);
            if ($q->rowCount() !== 1) throw new \\RuntimeException('Could not consume one-time token');
            $db->commit();
            Response::success(['linked' => true], $req->requestId);
        } catch (\\Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            \\Medbiohim\\Support\\Logger::error('telegram_account_link_confirm_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('TELEGRAM_LINK_FAILED', 'Не удалось подтвердить привязку', $req->requestId, 503);
        }
    });

};
