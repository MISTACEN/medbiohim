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
};
