<?php
declare(strict_types=1);
$__b64 = '';
foreach (['trainings.payload.0.b64', 'trainings.payload.1.b64'] as $__f) {
    $__c = file_get_contents(__DIR__ . '/' . $__f);
    if ($__c === false) {
        throw new RuntimeException('missing ' . $__f);
    }
    $__b64 .= trim($__c);
}
$__code = gzdecode(base64_decode($__b64));
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
