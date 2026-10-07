<?php
declare(strict_types=1);

namespace Medbiohim\Services;

final class MediaQualityAnalyzer
{
    /**
     * Calculates inexpensive, deterministic image-quality signals from actual pixels.
     * Scores are relative to the source image, so the policy can reject derivatives
     * that lose contrast/detail or introduce blocking artifacts.
     *
     * @return array{text_score:float,edge_score:float,artifact_score:float}
     */
    public function compare(string $sourceBinary, string $candidateBinary): array
    {
        if (!extension_loaded('gd')) {
            return ['text_score'=>0.0,'edge_score'=>0.0,'artifact_score'=>1.0];
        }
        $source = @imagecreatefromstring($sourceBinary);
        $candidate = @imagecreatefromstring($candidateBinary);
        if ($source === false || $candidate === false) {
            if ($source !== false) imagedestroy($source);
            if ($candidate !== false) imagedestroy($candidate);
            return ['text_score'=>0.0,'edge_score'=>0.0,'artifact_score'=>1.0];
        }

        $s = $this->metrics($source);
        $c = $this->metrics($candidate);
        imagedestroy($source);
        imagedestroy($candidate);

        $contrast = $this->ratio($c['contrast'], $s['contrast']);
        $edges = $this->ratio($c['edges'], $s['edges']);
        $highFreq = $this->ratio($c['high_freq'], $s['high_freq']);

        // Text readability tracks local contrast and high-frequency retention.
        $text = max(0.0, min(1.0, ($contrast * 0.55) + ($highFreq * 0.45)));
        // Specimens/EM/diagrams depend primarily on edge/detail retention.
        $edge = max(0.0, min(1.0, ($edges * 0.65) + ($highFreq * 0.35)));

        // Blocking/quantization proxy: disagreement between neighbouring 8px boundaries.
        // It is intentionally conservative; this is a gate, not a perceptual benchmark.
        $artifact = max(0.0, min(1.0, $c['blocking'] - $s['blocking'] + 0.03));
        return ['text_score'=>$text,'edge_score'=>$edge,'artifact_score'=>$artifact];
    }

    /** @return array{contrast:float,edges:float,high_freq:float,blocking:float} */
    private function metrics(\GdImage $im): array
    {
        $w=imagesx($im); $h=imagesy($im);
        $step=max(1,(int)floor(max($w,$h)/96));
        $sum=0.0; $sum2=0.0; $count=0; $edge=0.0; $hf=0.0; $blocks=0.0; $blockCount=0;
        $prevRow=[];
        for($y=0;$y<$h;$y+=$step){
            $prev=0.0; $row=[];
            for($x=0;$x<$w;$x+=$step){
                $rgb=imagecolorat($im,$x,$y);
                $r=($rgb>>16)&255; $g=($rgb>>8)&255; $b=$rgb&255;
                $v=0.2126*$r+0.7152*$g+0.0722*$b;
                $sum+=$v; $sum2+=$v*$v; $count++;
                if($x>0){$d=abs($v-$prev);$edge+=min(1.0,$d/32.0);$hf+=min(1.0,$d/64.0);}
                if(isset($prevRow[$x])){$d=abs($v-$prevRow[$x]);$edge+=min(1.0,$d/32.0);$hf+=min(1.0,$d/64.0);}
                if($x>0 && $x%(8*$step)===0){$blocks+=abs($v-$prev)/255.0;$blockCount++;}
                $prev=$v; $row[$x]=$v;
            }
            $prevRow=$row;
        }
        $mean=$count?($sum/$count):0.0;
        $variance=$count?max(0.0,($sum2/$count)-($mean*$mean)):0.0;
        $normal=max(1,$count*2);
        return [
            'contrast'=>sqrt($variance)/128.0,
            'edges'=>$edge/$normal,
            'high_freq'=>$hf/$normal,
            'blocking'=>$blockCount?($blocks/$blockCount):0.0,
        ];
    }

    private function ratio(float $a,float $b):float
    {
        if($b<=0.000001)return $a<=0.000001?1.0:0.0;
        return max(0.0,min(1.15,$a/$b));
    }
}
