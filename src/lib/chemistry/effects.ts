/**
 * Справочник электронных эффектов: индуктивный (±I), мезомерный (±M),
 * гиперконъюгация, ориентация в аренах и следствия для кислотности,
 * основности и реакционной способности.
 *
 * Данные лежат отдельно от разметки: таблицу заместителей можно править, не
 * трогая интерфейс (`EffectsReference`).
 */

export type Inductive = "-I" | "+I";
export type Mesomeric = "-M" | "+M";
export type Orientation = "I" | "II";
export type Reactivity = "activate" | "deactivate" | "neutral";
export type Strength = "сильный" | "средний" | "слабый";

export type EffectEntry = {
  id: string;
  /** Как заместитель пишется в формуле. */
  group: string;
  name: string;
  examples: string;
  /** Индуктивный эффект; null — практически не проявляется. */
  inductive: Inductive | null;
  inductiveStrength?: Strength;
  /** Мезомерный эффект; null — сопряжения с кольцом/π-системой нет. */
  mesomeric: Mesomeric | null;
  mesomericStrength?: Strength;
  /** Род ориентанта в реакциях электрофильного замещения аренов. */
  orientation: Orientation | null;
  reactivity: Reactivity | null;
  /** Влияние на кислотность O–H/N–H и основность. */
  shifts: string;
  note: string;
};

export type EffectTheoryCard = {
  id: string;
  title: string;
  badge: string;
  text: string;
  example: string;
};

/** Опубликованный тест по теме 1.2 — к нему ведут ссылки из справочника. */
export const EFFECT_TEST = {
  id: "2d5b1c82-005f-57f1-a07a-9562724805d2",
  title: "Оргхимия: 1.2. Химическая связь. Электронные эффекты",
  questions: 38,
};

export const EFFECT_THEORY: EffectTheoryCard[] = [
  {
    id: "inductive",
    title: "Индуктивный эффект",
    badge: "±I",
    text:
      "Смещение электронной плотности σ-связи к более электроотрицательному атому. Передаётся по цепочке σ-связей и быстро затухает: заметен через 2–3 связи, дальше почти нет. Алкильные группы и металлы отдают плотность (+I), галогены, кислород, азот, карбонил и нитрогруппа тянут её на себя (−I).",
    example: "Трихлоруксусная кислота сильнее уксусной: три −I-группы Cl усиливают отдачу H⁺.",
  },
  {
    id: "mesomeric",
    title: "Мезомерный эффект",
    badge: "±M",
    text:
      "Перераспределение π-электронов по системе сопряжённых связей. В отличие от индуктивного, не затухает с расстоянием, а работает по всей сопряжённой системе. +M — донор электронов в кольцо (неподелённая пара: −OH, −NH₂, −OR, галогены), −M — акцептор (кратные связи: −NO₂, −C=O, −CN, −SO₃H).",
    example: "Фенол: +M группы −OH активирует кольцо и направляет заместитель в орто/пара.",
  },
  {
    id: "hyperconjugation",
    title: "Гиперконъюгация",
    badge: "+Mσ",
    text:
      "Передача электронов σ-связи C–H (или C–C) на пустую/разрыхляющую π-орбиталь. Поэтому алкилы ведут себя как слабые доноры: стабилизируют карбокатионы и активируют кольцо. Чем больше α-водородов, тем сильнее эффект.",
    example: "Трет-бутильный катион устойчивее этильного — больше гиперконъюгации и +I.",
  },
  {
    id: "how-to-read",
    title: "Как читать знаки",
    badge: "→",
    text:
      "Знак показывает, куда уходит плотность от заместителя: «+» — отдаёт в систему, «−» — забирает. Если эффекты спорят (например, у галогенов −I против +M), смотри, что сильнее: у F/Cl/Br/I индуктивный перевешивает, поэтому кольцо деактивировано, но ориентация всё равно орто/пара.",
    example: "Хлорбензол нитруется труднее бензола, но даёт в основном орто- и пара-нитрохлорбензол.",
  },
];

export const EFFECT_ENTRIES: EffectEntry[] = [
  {
    id: "no2",
    group: "−NO₂",
    name: "нитрогруппа",
    examples: "нитробензол, нитроэтан",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: "-M", mesomericStrength: "сильный",
    orientation: "II", reactivity: "deactivate",
    shifts: "Сильно повышает кислотность C–H у α-углерода, понижает основность амина при сопряжении.",
    note: "Эталонный акцептор: и −I, и −M тянут плотность из кольца. Нитробензол нитруется в мета-положение и требует жёстких условий.",
  },
  {
    id: "so3h",
    group: "−SO₃H",
    name: "сульфогруппа",
    examples: "бензолсульфокислота",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: "-M", mesomericStrength: "средний",
    orientation: "II", reactivity: "deactivate",
    shifts: "Повышает кислотность (сильная кислота), деактивирует кольцо.",
    note: "Ориентант II рода; в сульфировании работает и как уходящая группа при десульфировании.",
  },
  {
    id: "cn",
    group: "−C≡N",
    name: "нитрил",
    examples: "бензонитрил, ацетонитрил",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: "-M", mesomericStrength: "сильный",
    orientation: "II", reactivity: "deactivate",
    shifts: "Заметно повышает кислотность α-C–H, понижает основность соседнего азота.",
    note: "Тройная связь принимает плотность по −M, поэтому кольцо деактивировано и ориентировано в мета.",
  },
  {
    id: "cho",
    group: "−CHO",
    name: "альдегидная группа",
    examples: "бензальдегид",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "-M", mesomericStrength: "сильный",
    orientation: "II", reactivity: "deactivate",
    shifts: "Повышает кислотность α-C–H (альдольная конденсация), деактивирует кольцо.",
    note: "Карбонил принимает плотность из кольца; в реакциях ЭАЗ направляет в мета.",
  },
  {
    id: "cooh",
    group: "−COOH",
    name: "карбоксильная группа",
    examples: "бензойная кислота",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "-M", mesomericStrength: "средний",
    orientation: "II", reactivity: "deactivate",
    shifts: "Повышает кислотность соседних O–H и C–H; сама — кислота.",
    note: "Мезомерный акцептор слабее нитрогруппы: кольцо деактивировано умеренно.",
  },
  {
    id: "coor",
    group: "−COOR",
    name: "сложноэфирная группа",
    examples: "метилбензоат",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "-M", mesomericStrength: "средний",
    orientation: "II", reactivity: "deactivate",
    shifts: "Повышает кислотность α-C–H, деактивирует кольцо.",
    note: "Как и карбонил, ориентирует в мета; по силе между −CHO и −COOH.",
  },
  {
    id: "conh2",
    group: "−CONH₂",
    name: "амидная группа",
    examples: "бензамид",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "-M", mesomericStrength: "слабый",
    orientation: "II", reactivity: "deactivate",
    shifts: "Понижает основность азота амида (сопряжение с C=O).",
    note: "+M амидного азота гасит −M карбонила, поэтому деактивация слабая, но ориентация всё равно мета.",
  },
  {
    id: "ccl3",
    group: "−CCl₃",
    name: "трихлорметил",
    examples: "трихлорметилбензол",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: null,
    orientation: "II", reactivity: "deactivate",
    shifts: "Резко повышает кислотность соседних C–H.",
    note: "Сопряжения с кольцом нет — работает только сильный −I, поэтому ориентант II рода.",
  },
  {
    id: "cf3",
    group: "−CF₃",
    name: "трифторметил",
    examples: "трифторметилбензол",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: null,
    orientation: "II", reactivity: "deactivate",
    shifts: "Сильно повышает кислотность соседних C–H и O–H.",
    note: "Один из самых сильных −I-заместителей; сопряжения нет.",
  },
  {
    id: "nh3plus",
    group: "−NH₃⁺",
    name: "протонированная аминогруппа",
    examples: "анилин в кислой среде",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: null,
    orientation: "II", reactivity: "deactivate",
    shifts: "В кислой среде анилин теряет +M и становится деактивирующим ориентантом II рода.",
    note: "Почему анилин в сильной кислоте нитруется в мета: неподелённой пары на азоте уже нет.",
  },
  {
    id: "nr3plus",
    group: "−NR₃⁺",
    name: "четвертичный аммоний",
    examples: "триметиланилиний",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: null,
    orientation: "II", reactivity: "deactivate",
    shifts: "Постоянный −I без возможности отдать пару.",
    note: "Полный аналог −NH₃⁺, но заряд нельзя снять депротонированием.",
  },
  {
    id: "no",
    group: "−NO",
    name: "нитрозогруппа",
    examples: "нитрозобензол",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "-M", mesomericStrength: "средний",
    orientation: "II", reactivity: "deactivate",
    shifts: "Акцептор по обоим механизмам.",
    note: "Встречается реже нитрогруппы, но ведёт себя так же: мета-ориентант.",
  },
  {
    id: "f",
    group: "−F",
    name: "фтор",
    examples: "фторбензол, фторметан",
    inductive: "-I", inductiveStrength: "сильный",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "deactivate",
    shifts: "Повышает кислотность рядом стоящих O–H; сам по себе сильно электроотрицателен.",
    note: "Классический спор эффектов: −I сильнее +M, кольцо деактивировано, но ориентация орто/пара.",
  },
  {
    id: "cl",
    group: "−Cl",
    name: "хлор",
    examples: "хлорбензол, хлорэтан",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "deactivate",
    shifts: "Повышает кислотность соседних O–H (хлоруксусная кислота сильнее уксусной).",
    note: "Деактивирует кольцо, но направляет в орто/пара — это надо помнить на тестах.",
  },
  {
    id: "br",
    group: "−Br",
    name: "бром",
    examples: "бромбензол",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "deactivate",
    shifts: "Похож на хлор, но −I слабее.",
    note: "Ориентант I рода при деактивирующем действии.",
  },
  {
    id: "i",
    group: "−I",
    name: "иод",
    examples: "иодбензол",
    inductive: "-I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "deactivate",
    shifts: "Самый слабый −I среди галогенов.",
    note: "Почти не деактивирует, но по-прежнему орто/пара-ориентант.",
  },
  {
    id: "oh",
    group: "−OH",
    name: "гидроксигруппа",
    examples: "фенол, этанол",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "+M", mesomericStrength: "сильный",
    orientation: "I", reactivity: "activate",
    shifts: "В феноле +M перевешивает −I: O–H кислотнее, чем у спиртов (pKa ≈ 10 против 16).",
    note: "Сильный активатор кольца: фенол нитруется уже разбавленной азотной кислотой.",
  },
  {
    id: "or",
    group: "−OR",
    name: "алкоксигруппа",
    examples: "анизол, метоксибензол",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "+M", mesomericStrength: "сильный",
    orientation: "I", reactivity: "activate",
    shifts: "Кислотность O–H не проявляется: атома водорода на кислороде нет.",
    note: "Активатор и ориентант I рода; по силе близок к −OH.",
  },
  {
    id: "nh2",
    group: "−NH₂",
    name: "аминогруппа",
    examples: "анилин",
    inductive: "-I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "сильный",
    orientation: "I", reactivity: "activate",
    shifts: "Понижает основность по сравнению с алифатическими аминами: пара азота уходит в кольцо.",
    note: "Активатор и орто/пара-ориентант; в кислой среде +M исчезает (см. −NH₃⁺).",
  },
  {
    id: "nr2",
    group: "−NR₂",
    name: "диалкиламиногруппа",
    examples: "N,N-диметиланилин",
    inductive: "-I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "сильный",
    orientation: "I", reactivity: "activate",
    shifts: "Основность ниже, чем у алифатического амина, по той же причине.",
    note: "Сильный активатор: алкилы дополнительно дают +I.",
  },
  {
    id: "nhcor",
    group: "−NHCOR",
    name: "ациламиногруппа",
    examples: "ацетанилид",
    inductive: "-I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "средний",
    orientation: "I", reactivity: "activate",
    shifts: "Амидный азот почти неосновен: пара уходит в карбонил.",
    note: "Слабее активирует, чем −NH₂, но всё равно орто/пара-ориентант.",
  },
  {
    id: "ocor",
    group: "−OCOR",
    name: "ацилоксигруппа",
    examples: "фенилацетат",
    inductive: "-I", inductiveStrength: "средний",
    mesomeric: "+M", mesomericStrength: "средний",
    orientation: "I", reactivity: "activate",
    shifts: "Кислотность не проявляет, основной центр — карбонил.",
    note: "Слабее −OR как донор: пара кислорода частично занята карбонилом.",
  },
  {
    id: "o-minus",
    group: "−O⁻",
    name: "алкоголятный кислород",
    examples: "фенолят-ион",
    inductive: "+I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "сильный",
    orientation: "I", reactivity: "activate",
    shifts: "Резко усиливает активацию кольца; фенолят нитруется ещё легче фенола.",
    note: "Отрицательный заряд — самый сильный донор в этой таблице.",
  },
  {
    id: "sr",
    group: "−SR",
    name: "сульфидная группа",
    examples: "тиоанизол",
    inductive: "-I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "средний",
    orientation: "I", reactivity: "activate",
    shifts: "Практически не влияет на O–H-кислотность.",
    note: "Сера отдаёт пару хуже кислорода, поэтому активация умеренная.",
  },
  {
    id: "ch3",
    group: "−CH₃",
    name: "метильная группа",
    examples: "толуол",
    inductive: "+I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "activate",
    shifts: "Понижает кислотность рядом стоящих O–H и C–H.",
    note: "+M здесь — гиперконъюгация; толуол нитруется легче бензола и даёт орто/пара-продукты.",
  },
  {
    id: "ethyl",
    group: "−C₂H₅",
    name: "этильная группа",
    examples: "этилбензол",
    inductive: "+I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "activate",
    shifts: "Как у метила: слабо понижает кислотность.",
    note: "Больше α-водородов — гиперконъюгация чуть сильнее, чем у метила.",
  },
  {
    id: "isopropyl",
    group: "−CH(CH₃)₂",
    name: "изопропил",
    examples: "изопропилбензол (кумол)",
    inductive: "+I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "activate",
    shifts: "Понижает кислотность соседних связей.",
    note: "Донор, но объёмный: в орто-положение идёт хуже из-за стерики.",
  },
  {
    id: "tbu",
    group: "−C(CH₃)₃",
    name: "трет-бутил",
    examples: "трет-бутилбензол",
    inductive: "+I", inductiveStrength: "средний",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "activate",
    shifts: "Самый сильный +I среди алкилов.",
    note: "Активирует кольцо, но из-за объёма почти не даёт орто-продукт — пример стерического контроля.",
  },
  {
    id: "phenyl",
    group: "−C₆H₅",
    name: "фенил",
    examples: "бифенил",
    inductive: "-I", inductiveStrength: "слабый",
    mesomeric: "+M", mesomericStrength: "слабый",
    orientation: "I", reactivity: "neutral",
    shifts: "Слабо влияет на кислотность; сам фенил — акцептор по индукции.",
    note: "Второе кольцо сопряжено, поэтому ориентация орто/пара, а активация почти нулевая.",
  },
];

export type EffectFilter = "all" | "-I" | "+I" | "-M" | "+M" | "I" | "II";

export const EFFECT_FILTERS: Array<{ id: EffectFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "-I", label: "−I" },
  { id: "+I", label: "+I" },
  { id: "-M", label: "−M" },
  { id: "+M", label: "+M" },
  { id: "I", label: "I род (орто/пара)" },
  { id: "II", label: "II род (мета)" },
];

export function matchesEffectQuery(entry: EffectEntry, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/ё/g, "е");
  if (!q) return true;
  const haystack = [entry.group, entry.name, entry.examples, entry.note, entry.shifts]
    .join(" ")
    .toLowerCase()
    .replace(/ё/g, "е");
  return haystack.includes(q);
}

export function matchesEffectFilter(entry: EffectEntry, filter: EffectFilter): boolean {
  if (filter === "all") return true;
  if (filter === "I" || filter === "II") return entry.orientation === filter;
  if (filter === "-I" || filter === "+I") return entry.inductive === filter;
  return entry.mesomeric === filter;
}

export function filterEffects(query: string, filter: EffectFilter): EffectEntry[] {
  return EFFECT_ENTRIES.filter(
    (entry) => matchesEffectFilter(entry, filter) && matchesEffectQuery(entry, query),
  );
}
