<?php
declare(strict_types=1);
$__b64 = file_get_contents(__DIR__ . '/trainings.payload.b64');
if ($__b64 === false) {
    throw new RuntimeException('missing trainings.payload.b64');
}
$__code = gzdecode(base64_decode(trim($__b64)));
if ($__code === false) {
    throw new RuntimeException('trainings payload decode failed');
}
$__tmp = tempnam(sys_get_temp_dir(), 'mbh_tr_');
file_put_contents($__tmp, $__code);
try {
    return require $__tmp;
} finally {
    @unlink($__tmp);
}
