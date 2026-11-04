/**
 * Балансировка химических уравнений.
 *
 * Два шага:
 * - парсер формул: "KMnO4", "H2O", "Fe(OH)3", "Ca3(PO4)2", а также ионы в
 *   квадратных скобках — "[Fe3+]", "[SO4 2-]", "[MnO4-]" (заряд записывается
 *   цифрами перед знаком +/−, пробел отделяет заряд от формулы);
 * - решатель: для каждого элемента (и отдельной строкой — суммарный заряд)
 *   строится уравнение «слева минус справа = 0». Получается однородная СЛАУ,
 *   которая решается методом Гаусса над точными дробями (без плавающей точки,
 *   чтобы не ловить ошибки округления). Дробное решение приводится к
 *   минимальным положительным целым коэффициентам через НОК знаменателей и
 *   сокращение на НОД.
 *
 * ВАЖНО (педагогическая оговорка для UI): формальная балансировка доказывает
 * только сохранение атомов и суммарного заряда. Она НЕ доказывает, что реакция
 * реально протекает — направление и скорость определяют термодинамика (ΔG) и
 * кинетика, а не умение расставить коэффициенты.
 */

export type Formula = {
  /** Состав: символ элемента → число атомов. */
  elements: Record<string, number>;
  /** Суммарный заряд частицы: +2 у "[Fe2+]", −1 у "[MnO4-]", 0 у нейтральных. */
  charge: number;
};

export type BalanceResult = {
  ok: boolean;
  /** Подобранные коэффициенты: сначала для реагентов, затем для продуктов. */
  coefficients: number[];
  reactants: string[];
  products: string[];
  /** Готовая строка вида "2 KMnO4 + 16 HCl -> 2 KCl + ..."; коэффициент 1 не печатается. */
  balanced?: string;
  error?: string;
  /** Верификация после решения: сохранение атомов каждого элемента. */
  atomCheck?: boolean;
  /** Верификация после решения: сохранение суммарного заряда. */
  chargeCheck?: boolean;
};

/** Все символы элементов 1–118 групп периодической таблицы. */
const ELEMENTS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
  "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
  "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
  "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
  "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
  "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
  "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
  "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]);

function fail(message: string): never {
  throw new Error(message);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a / gcd(a, b) * b);
}

/* -------------------------------------------------------------------------- */
/* Парсер формул                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Разбор состава без скобок-ионов: последовательность элементов и групп "(...)".
 * Рекурсивный спуск по позиции в строке — индексы группы умножаются на множитель.
 */
function parseBody(source: string, original: string): Record<string, number> {
  let position = 0;

  function add(target: Record<string, number>, element: string, count: number) {
    target[element] = (target[element] ?? 0) + count;
  }

  function readMultiplier(): number {
    const start = position;
    while (position < source.length && source[position] >= "0" && source[position] <= "9") position += 1;
    if (position === start) return 1;
    const value = Number(source.slice(start, position));
    if (!Number.isInteger(value) || value <= 0) {
      fail(`Некорректный индекс «${source.slice(start, position)}» в формуле «${original}»`);
    }
    return value;
  }

  function parseGroup(nested: boolean): Record<string, number> {
    const group: Record<string, number> = {};
    while (position < source.length) {
      const ch = source[position];
      if (ch === ")") {
        if (!nested) fail(`Лишняя закрывающая скобка в формуле «${original}»`);
        return group;
      }
      if (ch === "(") {
        position += 1;
        const inner = parseGroup(true);
        if (source[position] !== ")") fail(`Не закрыта скобка в формуле «${original}»`);
        position += 1;
        const multiplier = readMultiplier();
        for (const [element, count] of Object.entries(inner)) {
          add(group, element, count * multiplier);
        }
        continue;
      }
      if (ch >= "A" && ch <= "Z") {
        // Читаем «заглавная + строчные» и режем на символы элементов жадно:
        // "Nab" → "Na" + неизвестное "b" → ошибка, а не молчаливый мусор.
        let end = position + 1;
        while (end < source.length && source[end] >= "a" && source[end] <= "z") end += 1;
        const run = source.slice(position, end);
        const found: Record<string, number> = {};
        let offset = 0;
        while (offset < run.length) {
          const two = run.slice(offset, offset + 2);
          if (two.length === 2 && ELEMENTS.has(two)) {
            add(found, two, 1);
            offset += 2;
            continue;
          }
          const one = run.slice(offset, offset + 1);
          if (ELEMENTS.has(one)) {
            add(found, one, 1);
            offset += 1;
            continue;
          }
          fail(`Неизвестный элемент «${run.slice(offset)}» в формуле «${original}»`);
        }
        position = end;
        const multiplier = readMultiplier();
        for (const [element, count] of Object.entries(found)) {
          add(group, element, count * multiplier);
        }
        continue;
      }
      fail(`Непонятный символ «${ch}» в формуле «${original}»`);
    }
    return group;
  }

  const result = parseGroup(false);
  if (Object.keys(result).length === 0) fail(`Пустая формула «${original}»`);
  return result;
}

/**
 * Разбор полной формулы, включая ионы в квадратных скобках.
 * Заряд: "[Fe3+]" → +3 (цифры вплотную к знаку при одноэлементном остатке),
 * "[SO4 2-]" → −2 (пробел явно отделяет заряд), "[MnO4-]" → −1 (цифра 4 —
 * часть формулы, потому что после её удаления остаются два элемента).
 */
function parseFormulaStrict(input: string): Formula {
  const raw = input.trim();
  if (!raw) fail("Пустая формула");
  if (/^\d/.test(raw)) {
    fail(`Формула «${raw}» начинается с коэффициента — коэффициенты подбирает решатель, введите уравнение без них`);
  }

  let charge = 0;
  let body = raw;
  if (raw.startsWith("[")) {
    if (!raw.endsWith("]")) fail(`Не закрыта квадратная скобка иона «${raw}»`);
    body = raw.slice(1, -1);
    const last = body.slice(-1);
    if (last === "+" || last === "-") {
      let rest = body.slice(0, -1).trimEnd();
      let magnitude = 1;
      const digits = rest.match(/(\d+)$/);
      const spaced = /\s\d+$/.test(rest);
      if (digits) {
        const candidate = Number(digits[1]);
        const without = rest.slice(0, rest.length - digits[1].length).trimEnd();
        // Без пробела цифры считаем зарядом, только если остаток — одноэлементная формула
        // ("Fe2+" → Fe²⁺), иначе это индекс ("MnO4-" → MnO₄⁻).
        let asCharge = spaced;
        if (!asCharge) {
          try {
            const probe = parseBody(without, without);
            asCharge = Object.keys(probe).length === 1;
          } catch {
            asCharge = false;
          }
        }
        if (asCharge) {
          magnitude = candidate;
          rest = without;
        }
      }
      if (!rest) fail(`Пустая формула иона «${raw}»`);
      charge = last === "+" ? magnitude : -magnitude;
      body = rest;
    }
  }

  return { elements: parseBody(body, raw), charge };
}

/** Публичный парсер: некорректный ввод даёт null, а не исключение. */
export function parseFormula(formula: string): Formula | null {
  try {
    return parseFormulaStrict(formula);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Точные дроби и метод Гаусса                                                */
/* -------------------------------------------------------------------------- */

/** Рациональное число n/d, d > 0, несократимая дробь. */
type Frac = { n: number; d: number };

function frac(n: number, d = 1): Frac {
  if (d === 0) fail("Деление на ноль при решении системы");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

function fAdd(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

function fSub(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

function fMul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

function fDiv(a: Frac, b: Frac): Frac {
  if (b.n === 0) fail("Деление на нулевую дробь при решении системы");
  return frac(a.n * b.d, a.d * b.n);
}

function fNeg(a: Frac): Frac {
  return { n: -a.n, d: a.d };
}

/** Приведение однородной матрицы к ступенчатому виду по Гауссу (RREF). */
function reducedRowEchelon(matrix: Frac[][], columns: number): { rows: Frac[][]; pivotCols: number[] } {
  const rows = matrix.map((row) => [...row]);
  const pivotCols: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columns && pivotRow < rows.length; column += 1) {
    let pivot = -1;
    for (let index = pivotRow; index < rows.length; index += 1) {
      if (rows[index][column].n !== 0) {
        pivot = index;
        break;
      }
    }
    if (pivot === -1) continue;
    [rows[pivotRow], rows[pivot]] = [rows[pivot], rows[pivotRow]];
    const head = rows[pivotRow][column];
    rows[pivotRow] = rows[pivotRow].map((value) => fDiv(value, head));
    for (let index = 0; index < rows.length; index += 1) {
      if (index === pivotRow || rows[index][column].n === 0) continue;
      const factor = rows[index][column];
      rows[index] = rows[index].map((value, j) => fSub(value, fMul(factor, rows[pivotRow][j])));
    }
    pivotCols.push(column);
    pivotRow += 1;
  }
  return { rows, pivotCols };
}

type IntegerCandidate = { coefficients: number[]; total: number };

/**
 * Перебор базисных решений нуль-пространства: всем свободным переменным даём 1,
 * а также поочерёдно единицу одной из них (остальные — нули). Каждый кандидат
 * переводится в минимальные целые положительные коэффициенты; нули и смесь
 * знаков отбрасываются.
 */
function integerCandidates(
  rrefRows: Frac[][],
  pivotCols: number[],
  freeCols: number[],
  size: number,
): IntegerCandidate[] {
  const assignments: number[][] = [freeCols.map(() => 1)];
  for (const free of freeCols) {
    assignments.push(freeCols.map((column) => (column === free ? 1 : 0)));
  }

  const candidates: IntegerCandidate[] = [];
  for (const assignment of assignments) {
    const solution: Frac[] = new Array(size);
    freeCols.forEach((column, index) => {
      solution[column] = frac(assignment[index]);
    });
    pivotCols.forEach((pivotCol, rowIndex) => {
      // В RREF строка даёт: x_pivot + Σ (a·x_free) = 0 → x_pivot = −Σ a·x_free.
      let value = frac(0);
      for (const free of freeCols) {
        value = fAdd(value, fMul(rrefRows[rowIndex][free], solution[free]));
      }
      solution[pivotCol] = fNeg(value);
    });

    const denominator = solution.reduce((acc, value) => lcm(acc, value.d), 1);
    let scaled = solution.map((value) => (value.n * denominator) / value.d);
    const common = scaled.reduce((acc, value) => gcd(acc, value), 0) || 1;
    scaled = scaled.map((value) => value / common);
    // Отрицательные коэффициенты не имеют химического смысла; целый вектор
    // можно умножить на −1 только если все знаки одинаковы.
    if (scaled.every((value) => value > 0)) {
      candidates.push({ coefficients: scaled, total: scaled.reduce((acc, value) => acc + value, 0) });
    } else if (scaled.every((value) => value < 0)) {
      const flipped = scaled.map((value) => -value);
      candidates.push({ coefficients: flipped, total: flipped.reduce((acc, value) => acc + value, 0) });
    }
  }
  return candidates;
}

/* -------------------------------------------------------------------------- */
/* Разбор уравнения и балансировка                                            */
/* -------------------------------------------------------------------------- */

/** Разделение стороны уравнения на слагаемые: «+» учитывается только вне скобок. */
function splitSide(side: string, label: string): string[] {
  if (!side.trim()) fail(`Пустая ${label} часть уравнения`);
  const terms: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of side) {
    if (ch === "[" || ch === "(") depth += 1;
    if (ch === "]" || ch === ")") depth -= 1;
    if (ch === "+" && depth === 0) {
      terms.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  terms.push(current);
  const cleaned = terms.map((term) => term.trim());
  if (cleaned.some((term) => !term)) {
    fail(`Пустое слагаемое в ${label} части — проверьте знаки «+»`);
  }
  return cleaned;
}

type Totals = { left: number; right: number };

/** Подсчёт атомов и заряда по каждой стороне для верификации решения. */
function verifySideTotals(
  formulas: Formula[],
  reactantCount: number,
  coefficients: number[],
): { elements: Record<string, Totals>; charge: Totals } {
  const elements: Record<string, Totals> = {};
  const charge: Totals = { left: 0, right: 0 };
  formulas.forEach((formula, index) => {
    const isReactant = index < reactantCount;
    const side = isReactant ? "left" : "right";
    for (const [element, count] of Object.entries(formula.elements)) {
      const bucket = (elements[element] ??= { left: 0, right: 0 });
      bucket[side] += count * coefficients[index];
    }
    charge[side] += formula.charge * coefficients[index];
  });
  return { elements, charge };
}

export function balanceEquation(equation: string): BalanceResult {
  const empty: BalanceResult = { ok: false, coefficients: [], reactants: [], products: [] };
  try {
    const raw = equation.trim();
    if (!raw) fail("Введите уравнение реакции");

    const arrowMatch = raw.match(/->|→|=>|=/);
    if (!arrowMatch || arrowMatch.index === undefined) {
      fail("Не найден знак реакции — используйте «->», «→» или «=»");
    }
    const arrow = arrowMatch[0];
    const leftRaw = raw.slice(0, arrowMatch.index);
    const rightRaw = raw.slice(arrowMatch.index + arrow.length);

    const reactants = splitSide(leftRaw, "левая");
    const products = splitSide(rightRaw, "правая");
    const terms = [...reactants, ...products];
    if (terms.length < 2) fail("Для уравнения нужно хотя бы одно вещество слева и одно справа");
    const formulas = terms.map((term) => parseFormulaStrict(term));

    const elementSet = new Set<string>();
    for (const formula of formulas) {
      for (const element of Object.keys(formula.elements)) elementSet.add(element);
    }
    const elements = [...elementSet].sort();
    const hasCharge = formulas.some((formula) => formula.charge !== 0);

    // Матрица составов: строка = элемент (или заряд), столбец = вещество,
    // знак плюс у реагентов и минус у продуктов (нуль-сумма).
    const rows: number[][] = elements.map((element) =>
      formulas.map((formula, index) => {
        const count = formula.elements[element] ?? 0;
        return index < reactants.length ? count : -count;
      }),
    );
    if (hasCharge) {
      rows.push(
        formulas.map((formula, index) => (index < reactants.length ? formula.charge : -formula.charge)),
      );
    }

    const size = formulas.length;
    const matrix = rows.map((row) => row.map((value) => frac(value)));
    const { rows: rrefRows, pivotCols } = reducedRowEchelon(matrix, size);
    const freeCols = Array.from({ length: size }, (_, index) => index).filter(
      (column) => !pivotCols.includes(column),
    );
    if (freeCols.length === 0) {
      fail("Система вырождена: единственное решение — нулевое, такое уравнение нельзя сбалансировать");
    }

    const candidates = integerCandidates(rrefRows, pivotCols, freeCols, size);
    if (candidates.length === 0) {
      fail("Не удалось подобрать положительные коэффициенты — проверьте состав веществ");
    }
    candidates.sort((a, b) => a.total - b.total || a.coefficients.join(",").localeCompare(b.coefficients.join(",")));
    const coefficients = candidates[0].coefficients;

    // Верификация: баланс должен выполняться точно, иначе решатель сломан.
    const totals = verifySideTotals(formulas, reactants.length, coefficients);
    const atomCheck = elements.every((element) => totals.elements[element].left === totals.elements[element].right);
    const chargeCheck = totals.charge.left === totals.charge.right;
    if (!atomCheck || !chargeCheck) {
      fail("Внутренняя ошибка: подобранные коэффициенты не прошли проверку баланса");
    }

    const formatTerm = (term: string, coefficient: number) => (coefficient === 1 ? term : `${coefficient} ${term}`);
    const balanced = [
      reactants.map((term, index) => formatTerm(term, coefficients[index])).join(" + "),
      "->",
      products.map((term, index) => formatTerm(term, coefficients[reactants.length + index])).join(" + "),
    ].join(" ");

    return {
      ok: true,
      coefficients,
      reactants,
      products,
      balanced,
      atomCheck,
      chargeCheck,
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Не удалось уравнять реакцию" };
  }
}
