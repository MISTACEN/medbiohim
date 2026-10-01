<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
$apiHealth = '/public/api/v1/health';
?>
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MEDBIOHIM API</title></head>
<body>
<main style="max-width:720px;margin:48px auto;font-family:system-ui,sans-serif;padding:20px">
<h1>MEDBIOHIM API</h1>
<p>Технический backend учебного портала MEDBIOHIM (SpaceWeb + PHP).</p>
<p><a href="<?= htmlspecialchars($apiHealth) ?>">Проверка API (health)</a></p>
</main>
</body>
</html>
