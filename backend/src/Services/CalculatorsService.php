<?php
declare(strict_types=1);

namespace Medbiohim\Services;

final class CalculatorsService
{
    /** @return list<array<string,mixed>> */
    public function catalog(): array
    {
        return [
            [
                'id' => 'bmi',
                'name' => 'Индекс массы тела (ИМТ)',
                'category' => 'общеклинические',
                'description' => 'Оценка массы тела по росту и массе.',
                'fields' => [
                    ['key' => 'weight_kg', 'label' => 'Масса, кг', 'type' => 'number', 'min' => 1, 'max' => 500, 'step' => 0.1],
                    ['key' => 'height_cm', 'label' => 'Рост, см', 'type' => 'number', 'min' => 40, 'max' => 250, 'step' => 0.1],
                ],
            ],
            [
                'id' => 'bsa',
                'name' => 'Площадь поверхности тела',
                'category' => 'общеклинические',
                'description' => 'Формула Mosteller для площади поверхности тела.',
                'fields' => [
                    ['key' => 'weight_kg', 'label' => 'Масса, кг', 'type' => 'number', 'min' => 1, 'max' => 500, 'step' => 0.1],
                    ['key' => 'height_cm', 'label' => 'Рост, см', 'type' => 'number', 'min' => 40, 'max' => 250, 'step' => 0.1],
                ],
            ],
            [
                'id' => 'ckd_epi_2021',
                'name' => 'eGFR CKD-EPI 2021',
                'category' => 'почки',
                'description' => 'Расчёт расчетной СКФ по креатинину без расового коэффициента.',
                'fields' => [
                    ['key' => 'age', 'label' => 'Возраст, лет', 'type' => 'number', 'min' => 18, 'max' => 120, 'step' => 1],
                    ['key' => 'creatinine_mg_dl', 'label' => 'Креатинин, мг/дл', 'type' => 'number', 'min' => 0.1, 'max' => 20, 'step' => 0.01],
                    ['key' => 'sex', 'label' => 'Пол', 'type' => 'select', 'options' => [['value' => 'female', 'label' => 'Женский'], ['value' => 'male', 'label' => 'Мужской']]],
                ],
            ],
            [
                'id' => 'cockcroft_gault',
                'name' => 'Клиренс креатинина Cockcroft–Gault',
                'category' => 'почки',
                'description' => 'Оценка клиренса креатинина для взрослых.',
                'fields' => [
                    ['key' => 'age', 'label' => 'Возраст, лет', 'type' => 'number', 'min' => 18, 'max' => 120, 'step' => 1],
                    ['key' => 'weight_kg', 'label' => 'Масса, кг', 'type' => 'number', 'min' => 1, 'max' => 400, 'step' => 0.1],
                    ['key' => 'creatinine_mg_dl', 'label' => 'Креатинин, мг/дл', 'type' => 'number', 'min' => 0.1, 'max' => 20, 'step' => 0.01],
                    ['key' => 'sex', 'label' => 'Пол', 'type' => 'select', 'options' => [['value' => 'female', 'label' => 'Женский'], ['value' => 'male', 'label' => 'Мужской']]],
                ],
            ],
            [
                'id' => 'anion_gap',
                'name' => 'Анионная разница',
                'category' => 'лаборатория',
                'description' => 'Расчёт AG по натрию, хлору и бикарбонату.',
                'fields' => [
                    ['key' => 'sodium', 'label' => 'Na⁺, ммоль/л', 'type' => 'number', 'min' => 80, 'max' => 220, 'step' => 0.1],
                    ['key' => 'chloride', 'label' => 'Cl⁻, ммоль/л', 'type' => 'number', 'min' => 40, 'max' => 180, 'step' => 0.1],
                    ['key' => 'bicarbonate', 'label' => 'HCO₃⁻, ммоль/л', 'type' => 'number', 'min' => 1, 'max' => 80, 'step' => 0.1],
                    ['key' => 'albumin', 'label' => 'Альбумин, г/дл', 'type' => 'number', 'min' => 0.5, 'max' => 8, 'step' => 0.1, 'optional' => true],
                ],
            ],
            [
                'id' => 'corrected_calcium',
                'name' => 'Скорректированный кальций',
                'category' => 'лаборатория',
                'description' => 'Приближённая коррекция общего кальция по альбумину.',
                'fields' => [
                    ['key' => 'calcium_mg_dl', 'label' => 'Общий Ca, мг/дл', 'type' => 'number', 'min' => 1, 'max' => 20, 'step' => 0.1],
                    ['key' => 'albumin_g_dl', 'label' => 'Альбумин, г/дл', 'type' => 'number', 'min' => 0.5, 'max' => 8, 'step' => 0.1],
                ],
            ],
            [
                'id' => 'serum_osmolality',
                'name' => 'Осмолярность сыворотки',
                'category' => 'лаборатория',
                'description' => 'Расчётная осмолярность по натрию, глюкозе и мочевине.',
                'fields' => [
                    ['key' => 'sodium', 'label' => 'Na⁺, ммоль/л', 'type' => 'number', 'min' => 80, 'max' => 220, 'step' => 0.1],
                    ['key' => 'glucose_mg_dl', 'label' => 'Глюкоза, мг/дл', 'type' => 'number', 'min' => 1, 'max' => 1000, 'step' => 1],
                    ['key' => 'bun_mg_dl', 'label' => 'BUN, мг/дл', 'type' => 'number', 'min' => 1, 'max' => 300, 'step' => 1],
                ],
            ],
            [
                'id' => 'infusion_rate',
                'name' => 'Скорость инфузии',
                'category' => 'дозы',
                'description' => 'Расчёт мл/ч и капель/мин для заданного объёма и времени.',
                'fields' => [
                    ['key' => 'volume_ml', 'label' => 'Объём, мл', 'type' => 'number', 'min' => 1, 'max' => 10000, 'step' => 1],
                    ['key' => 'time_hours', 'label' => 'Время, ч', 'type' => 'number', 'min' => 0.1, 'max' => 100, 'step' => 0.1],
                    ['key' => 'drop_factor', 'label' => 'Капель/мл', 'type' => 'number', 'min' => 1, 'max' => 100, 'step' => 1, 'default' => 20],
                ],
            ],
        ];
    }

    public function get(string $id): ?array
    {
        foreach ($this->catalog() as $item) if ((string) $item['id'] === $id) return $item;
        return null;
    }

    public function compute(string $id, array $input): array
    {
        $calculator = $this->get($id);
        if ($calculator === null) throw new \InvalidArgumentException('Калькулятор не найден');

        $v = static function (string $key, array $input, bool $required = true): float {
            $raw = $input[$key] ?? null;
            if ($raw === null || $raw === '') {
                if ($required) throw new \InvalidArgumentException('Поле '.$key.' обязательно');
                return 0.0;
            }
            if (!is_numeric($raw)) throw new \InvalidArgumentException('Поле '.$key.' должно быть числом');
            return (float) $raw;
        };

        $round = static fn(float $x): float => round($x, 2);
        $warn = [];
        $result = [];
        $interpretation = '';

        switch ($id) {
            case 'bmi':
                $weight = $v('weight_kg', $input);
                $height = $v('height_cm', $input);
                if ($height <= 0) throw new \InvalidArgumentException('Рост должен быть больше нуля');
                $bmi = $weight / (($height / 100) ** 2);
                $result = ['ИМТ' => $round($bmi)];
                $interpretation = $bmi < 18.5 ? 'Ниже обычного диапазона взрослого ИМТ.' : ($bmi < 25 ? 'Диапазон 18.5–24.9.' : ($bmi < 30 ? 'Диапазон избыточной массы тела.' : 'Диапазон ожирения по ИМТ.'));
                break;

            case 'bsa':
                $weight = $v('weight_kg', $input);
                $height = $v('height_cm', $input);
                $bsa = sqrt(($weight * $height) / 3600);
                $result = ['ППТ, м²' => $round($bsa)];
                $interpretation = 'Формула Mosteller, справочный расчёт.';
                break;

            case 'ckd_epi_2021':
                $age = $v('age', $input);
                $scr = $v('creatinine_mg_dl', $input);
                $sex = (string) ($input['sex'] ?? '');
                if ($age < 18 || $scr <= 0 || !in_array($sex, ['female', 'male'], true)) throw new \InvalidArgumentException('Проверьте возраст, креатинин и пол');
                $k = $sex === 'female' ? 0.7 : 0.9;
                $alpha = $sex === 'female' ? -0.241 : -0.302;
                $egfr = 142 * (min($scr / $k, 1) ** $alpha) * (max($scr / $k, 1) ** -1.200) * (0.9938 ** $age);
                if ($sex === 'female') $egfr *= 1.012;
                $result = ['СКФ, мл/мин/1.73 м²' => $round($egfr)];
                $interpretation = 'CKD-EPI 2021, интерпретировать с учётом клинического контекста.';
                break;

            case 'cockcroft_gault':
                $age = $v('age', $input);
                $weight = $v('weight_kg', $input);
                $scr = $v('creatinine_mg_dl', $input);
                $sex = (string) ($input['sex'] ?? '');
                if ($age <= 0 || $weight <= 0 || $scr <= 0 || !in_array($sex, ['female', 'male'], true)) throw new \InvalidArgumentException('Проверьте входные данные');
                $crcl = ((140 - $age) * $weight) / (72 * $scr);
                if ($sex === 'female') $crcl *= 0.85;
                $result = ['CrCl, мл/мин' => $round($crcl)];
                $interpretation = 'Cockcroft–Gault; для дозировок учитывайте локальные рекомендации и клинический контекст.';
                break;

            case 'anion_gap':
                $na = $v('sodium', $input);
                $cl = $v('chloride', $input);
                $hco3 = $v('bicarbonate', $input);
                $ag = $na - $cl - $hco3;
                $albumin = $v('albumin', $input, false);
                $corrected = $albumin > 0 ? $ag + 2.5 * (4 - $albumin) : $ag;
                $result = ['Анионная разница' => $round($ag)];
                if ($albumin > 0) $result['AG с поправкой на альбумин'] = $round($corrected);
                $interpretation = 'Без K⁺. Референсы зависят от метода лаборатории.';
                break;

            case 'corrected_calcium':
                $ca = $v('calcium_mg_dl', $input);
                $alb = $v('albumin_g_dl', $input);
                $correctedCa = $ca + 0.8 * (4 - $alb);
                $result = ['Скорректированный Ca, мг/дл' => $round($correctedCa)];
                $interpretation = 'Приближённая коррекция общего Ca при изменении альбумина.';
                break;

            case 'serum_osmolality':
                $na = $v('sodium', $input);
                $glucose = $v('glucose_mg_dl', $input);
                $bun = $v('bun_mg_dl', $input);
                $osm = 2 * $na + $glucose / 18 + $bun / 2.8;
                $result = ['Расчётная осмолярность, мОсм/кг' => $round($osm)];
                $interpretation = 'Расчётная, а не измеренная осмолярность.';
                break;

            case 'infusion_rate':
                $volume = $v('volume_ml', $input);
                $hours = $v('time_hours', $input);
                $drop = $v('drop_factor', $input);
                if ($hours <= 0 || $drop <= 0) throw new \InvalidArgumentException('Время и капельный фактор должны быть больше нуля');
                $mlh = $volume / $hours;
                $gtt = ($volume * $drop) / ($hours * 60);
                $result = ['мл/ч' => $round($mlh), 'капель/мин' => round($gtt)];
                $interpretation = 'Справочный расчёт скорости инфузии.';
                break;

            default:
                throw new \InvalidArgumentException('Неизвестный калькулятор');
        }

        return [
            'id' => $id,
            'result' => $result,
            'interpretation' => $interpretation,
            'warnings' => $warn,
        ];
    }
}
