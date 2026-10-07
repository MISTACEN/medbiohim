<?php
declare(strict_types=1);

namespace Medbiohim\Services;

/**
 * Pure media policy: chooses the smallest derivative candidate that passes
 * content-aware safety gates. It never deletes or rewrites the original.
 */
final class MediaQualityPolicy
{
    /**
     * @param list<array{key:string,size_bytes:int,width?:int,height?:int,text_score?:float,edge_score?:float,artifact_score?:float}> $candidates
     * @return array{selected:?array,rejected:list<array{key:string,reason:string}>}
     */
    public function choose(array $candidates, string $kind, int $sourceWidth = 0, int $sourceHeight = 0): array
    {
        $rejected = [];
        $accepted = [];

        foreach ($candidates as $candidate) {
            $key = (string)($candidate['key'] ?? '');
            $size = (int)($candidate['size_bytes'] ?? 0);
            $width = (int)($candidate['width'] ?? 0);
            $height = (int)($candidate['height'] ?? 0);
            $text = (float)($candidate['text_score'] ?? 1.0);
            $edge = (float)($candidate['edge_score'] ?? 1.0);
            $artifact = (float)($candidate['artifact_score'] ?? 0.0);

            if ($key === '' || $size <= 0) {
                $rejected[] = ['key' => $key, 'reason' => 'invalid_candidate'];
                continue;
            }

            // Never accept a derivative that is materially smaller than its
            // declared source role when it would make labels/text unreadable.
            $minimumWidth = match ($kind) {
                'text-heavy', 'diagram', 'scan' => 1200,
                'electronogram', 'micropreparation', 'atlas' => 1400,
                'photo', 'mixed' => 1000,
                default => 1000,
            };

            if ($width > 0 && $width < $minimumWidth && in_array($kind, ['text-heavy','diagram','scan'], true)) {
                $rejected[] = ['key' => $key, 'reason' => 'insufficient_width'];
                continue;
            }

            if ($sourceWidth > 0 && $width > 0 && $width < (int)floor($sourceWidth * 0.25)) {
                $rejected[] = ['key' => $key, 'reason' => 'too_aggressive_downscale'];
                continue;
            }

            if ($text < 0.90 && in_array($kind, ['text-heavy','diagram','scan'], true)) {
                $rejected[] = ['key' => $key, 'reason' => 'text_readability'];
                continue;
            }

            if ($edge < 0.88 && in_array($kind, ['electronogram','micropreparation','atlas','diagram'], true)) {
                $rejected[] = ['key' => $key, 'reason' => 'edge_detail_loss'];
                continue;
            }

            if ($artifact > 0.12) {
                $rejected[] = ['key' => $key, 'reason' => 'compression_artifacts'];
                continue;
            }

            $accepted[] = $candidate;
        }

        usort($accepted, static fn(array $a, array $b): int =>
            (int)$a['size_bytes'] <=> (int)$b['size_bytes']
        );

        return [
            'selected' => $accepted[0] ?? null,
            'rejected' => $rejected,
        ];
    }

    /** @return list<string> */
    public function candidateKeys(string $kind, string $sourceMime, int $width = 0, int $height = 0): array
    {
        if (str_starts_with($sourceMime, 'video/')) {
            return $width >= 1920 ? ['video-1080p', 'video-720p', 'video-480p'] : ['video-source', 'video-720p'];
        }

        if (!str_starts_with($sourceMime, 'image/')) {
            return ['source'];
        }

        return match ($kind) {
            'text-heavy', 'diagram', 'scan' => ['avif-high', 'webp-high', 'original'],
            'electronogram', 'micropreparation', 'atlas' => ['avif-detail', 'webp-detail', 'original'],
            default => ['avif', 'webp', 'original'],
        };
    }
}
