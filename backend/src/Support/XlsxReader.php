<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class XlsxReader
{
    public static function firstSheetRows(string $binary): array
    {
        if (!class_exists('ZipArchive')) throw new \RuntimeException('ZipArchive extension is required for XLSX import');
        $tmp = tempnam(sys_get_temp_dir(), 'mbx');
        if ($tmp === false || file_put_contents($tmp, $binary) === false) throw new \RuntimeException('Could not create XLSX temp file');
        $zip = new \ZipArchive();
        try {
            if ($zip->open($tmp) !== true) throw new \RuntimeException('Invalid XLSX file');
            $shared = [];
            $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
            if ($sharedXml !== false) {
                $sx = @simplexml_load_string($sharedXml);
                if ($sx !== false) {
                    foreach ($sx->si as $si) {
                        $text = '';
                        if (isset($si->t)) $text = (string)$si->t;
                        else foreach ($si->r as $r) $text .= (string)$r->t;
                        $shared[] = $text;
                    }
                }
            }
            $sheetPath = 'xl/worksheets/sheet1.xml';
            $workbookXml = $zip->getFromName('xl/workbook.xml');
            $relsXml = $zip->getFromName('xl/_rels/workbook.xml.rels');
            if ($workbookXml !== false && $relsXml !== false) {
                $wb = @simplexml_load_string($workbookXml);
                $rels = @simplexml_load_string($relsXml);
                if ($wb !== false && $rels !== false && isset($wb->sheets->sheet[0])) {
                    $rid = (string)$wb->sheets->sheet[0]->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')->id;
                    foreach ($rels->Relationship as $rel) {
                        if ((string)$rel['Id'] === $rid) {
                            $target = ltrim((string)$rel['Target'], '/');
                            $sheetPath = str_starts_with($target, 'xl/') ? $target : 'xl/' . $target;
                            break;
                        }
                    }
                }
            }
            $sheetXml = $zip->getFromName($sheetPath);
            if ($sheetXml === false) throw new \RuntimeException('First worksheet not found');
            $sheet = @simplexml_load_string($sheetXml);
            if ($sheet === false) throw new \RuntimeException('Invalid worksheet XML');
            $rows = [];
            foreach ($sheet->sheetData->row as $row) {
                $values = [];
                foreach ($row->c as $cell) {
                    $ref = (string)$cell['r'];
                    $col = self::columnIndex($ref);
                    $type = (string)$cell['t'];
                    $value = '';
                    if ($type === 's') {
                        $idx = (int)$cell->v;
                        $value = $shared[$idx] ?? '';
                    } elseif ($type === 'inlineStr') {
                        $value = isset($cell->is->t) ? (string)$cell->is->t : '';
                    } else {
                        $value = isset($cell->v) ? (string)$cell->v : '';
                    }
                    $values[$col] = trim($value);
                }
                if ($values) {
                    $max = max(array_keys($values));
                    $line = [];
                    for ($i = 0; $i <= $max; $i++) $line[] = $values[$i] ?? '';
                    $rows[] = $line;
                }
            }
            return $rows;
        } finally {
            $zip->close();
            @unlink($tmp);
        }
    }

    private static function columnIndex(string $ref): int
    {
        preg_match('/^([A-Z]+)/i', $ref, $m);
        $letters = strtoupper($m[1] ?? 'A'); $n = 0;
        for ($i = 0, $len = strlen($letters); $i < $len; $i++) $n = $n * 26 + (ord($letters[$i]) - 64);
        return max(0, $n - 1);
    }
}
