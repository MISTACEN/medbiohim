/**
 * Периодическая таблица: 118 элементов.
 *
 * Формат строки — «номер|символ|русское имя|атомная масса|группа|период|категория».
 * Масса «—» означает, что у элемента нет устойчивого изотопа (указана масса
 * самого долгоживущего изотопа в скобках в исходных справочниках).
 * Лантаноиды и актиноиды вынесены в отдельные ряды (периоды 9 и 10), как в
 * печатной таблице: в основной сетке на их месте стоит ссылка на ряд.
 */

export type ElementCategory =
  | "alkali"
  | "alkaline"
  | "transition"
  | "post"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble"
  | "lanthanide"
  | "actinide";

export type ChemicalElement = {
  number: number;
  symbol: string;
  name: string;
  mass: string;
  group: number;
  period: number;
  category: ElementCategory;
};

const RAW = `
1|H|Водород|1.008|1|1|nonmetal
2|He|Гелий|4.003|18|1|noble
3|Li|Литий|6.94|1|2|alkali
4|Be|Бериллий|9.012|2|2|alkaline
5|B|Бор|10.81|13|2|metalloid
6|C|Углерод|12.011|14|2|nonmetal
7|N|Азот|14.007|15|2|nonmetal
8|O|Кислород|15.999|16|2|nonmetal
9|F|Фтор|18.998|17|2|halogen
10|Ne|Неон|20.180|18|2|noble
11|Na|Натрий|22.990|1|3|alkali
12|Mg|Магний|24.305|2|3|alkaline
13|Al|Алюминий|26.982|13|3|post
14|Si|Кремний|28.085|14|3|metalloid
15|P|Фосфор|30.974|15|3|nonmetal
16|S|Сера|32.06|16|3|nonmetal
17|Cl|Хлор|35.45|17|3|halogen
18|Ar|Аргон|39.948|18|3|noble
19|K|Калий|39.098|1|4|alkali
20|Ca|Кальций|40.078|2|4|alkaline
21|Sc|Скандий|44.956|3|4|transition
22|Ti|Титан|47.867|4|4|transition
23|V|Ванадий|50.942|5|4|transition
24|Cr|Хром|51.996|6|4|transition
25|Mn|Марганец|54.938|7|4|transition
26|Fe|Железо|55.845|8|4|transition
27|Co|Кобальт|58.933|9|4|transition
28|Ni|Никель|58.693|10|4|transition
29|Cu|Медь|63.546|11|4|transition
30|Zn|Цинк|65.38|12|4|transition
31|Ga|Галлий|69.723|13|4|post
32|Ge|Германий|72.630|14|4|metalloid
33|As|Арсен|74.922|15|4|metalloid
34|Se|Селен|78.971|16|4|nonmetal
35|Br|Бром|79.904|17|4|halogen
36|Kr|Криптон|83.798|18|4|noble
37|Rb|Рубидий|85.468|1|5|alkali
38|Sr|Стронций|87.62|2|5|alkaline
39|Y|Иттрий|88.906|3|5|transition
40|Zr|Цирконий|91.224|4|5|transition
41|Nb|Ниобий|92.906|5|5|transition
42|Mo|Молибден|95.95|6|5|transition
43|Tc|Технеций|—|7|5|transition
44|Ru|Рутений|101.07|8|5|transition
45|Rh|Родий|102.91|9|5|transition
46|Pd|Палладий|106.42|10|5|transition
47|Ag|Серебро|107.87|11|5|transition
48|Cd|Кадмий|112.41|12|5|transition
49|In|Индий|114.82|13|5|post
50|Sn|Олово|118.71|14|5|post
51|Sb|Сурьма|121.76|15|5|metalloid
52|Te|Теллур|127.60|16|5|metalloid
53|I|Иод|126.90|17|5|halogen
54|Xe|Ксенон|131.29|18|5|noble
55|Cs|Цезий|132.91|1|6|alkali
56|Ba|Барий|137.33|2|6|alkaline
57|La|Лантан|138.91|3|9|lanthanide
58|Ce|Церий|140.12|4|9|lanthanide
59|Pr|Празеодим|140.91|5|9|lanthanide
60|Nd|Неодим|144.24|6|9|lanthanide
61|Pm|Прометий|—|7|9|lanthanide
62|Sm|Самарий|150.36|8|9|lanthanide
63|Eu|Европий|151.96|9|9|lanthanide
64|Gd|Гадолиний|157.25|10|9|lanthanide
65|Tb|Тербий|158.93|11|9|lanthanide
66|Dy|Диспрозий|162.50|12|9|lanthanide
67|Ho|Гольмий|164.93|13|9|lanthanide
68|Er|Эрбий|167.26|14|9|lanthanide
69|Tm|Тулий|168.93|15|9|lanthanide
70|Yb|Иттербий|173.05|16|9|lanthanide
71|Lu|Лютеций|174.97|17|9|lanthanide
72|Hf|Гафний|178.49|4|6|transition
73|Ta|Тантал|180.95|5|6|transition
74|W|Вольфрам|183.84|6|6|transition
75|Re|Рений|186.21|7|6|transition
76|Os|Осмий|190.23|8|6|transition
77|Ir|Иридий|192.22|9|6|transition
78|Pt|Платина|195.08|10|6|transition
79|Au|Золото|196.97|11|6|transition
80|Hg|Ртуть|200.59|12|6|transition
81|Tl|Таллий|204.38|13|6|post
82|Pb|Свинец|207.2|14|6|post
83|Bi|Бисмут|208.98|15|6|post
84|Po|Полоний|—|16|6|metalloid
85|At|Астат|—|17|6|halogen
86|Rn|Радон|—|18|6|noble
87|Fr|Франций|—|1|7|alkali
88|Ra|Радий|—|2|7|alkaline
89|Ac|Актиний|—|3|10|actinide
90|Th|Торий|232.04|4|10|actinide
91|Pa|Протактиний|231.04|5|10|actinide
92|U|Уран|238.03|6|10|actinide
93|Np|Нептуний|—|7|10|actinide
94|Pu|Плутоний|—|8|10|actinide
95|Am|Америций|—|9|10|actinide
96|Cm|Кюрий|—|10|10|actinide
97|Bk|Берклий|—|11|10|actinide
98|Cf|Калифорний|—|12|10|actinide
99|Es|Эйнштейний|—|13|10|actinide
100|Fm|Фермий|—|14|10|actinide
101|Md|Менделевий|—|15|10|actinide
102|No|Нобелий|—|16|10|actinide
103|Lr|Лоуренсий|—|17|10|actinide
104|Rf|Резерфордий|—|4|7|transition
105|Db|Дубний|—|5|7|transition
106|Sg|Сиборгий|—|6|7|transition
107|Bh|Борий|—|7|7|transition
108|Hs|Хассий|—|8|7|transition
109|Mt|Мейтнерий|—|9|7|transition
110|Ds|Дармштадтий|—|10|7|transition
111|Rg|Рентгений|—|11|7|transition
112|Cn|Коперниций|—|12|7|transition
113|Nh|Нихоний|—|13|7|post
114|Fl|Флеровий|—|14|7|post
115|Mc|Московий|—|15|7|post
116|Lv|Ливерморий|—|16|7|post
117|Ts|Теннессин|—|17|7|halogen
118|Og|Оганесон|—|18|7|noble
`.trim();

export const PERIODIC_ELEMENTS: ChemicalElement[] = RAW.split("\n").map((line) => {
  const [number, symbol, name, mass, group, period, category] = line.split("|");
  return {
    number: Number(number),
    symbol,
    name,
    mass,
    group: Number(group),
    period: Number(period),
    category: category as ElementCategory,
  };
});

export const CATEGORY_LABELS: Record<ElementCategory, string> = {
  alkali: "Щелочные металлы",
  alkaline: "Щелочноземельные",
  transition: "Переходные металлы",
  post: "Постпереходные металлы",
  metalloid: "Полуметаллы",
  nonmetal: "Неметаллы",
  halogen: "Галогены",
  noble: "Благородные газы",
  lanthanide: "Лантаноиды",
  actinide: "Актиноиды",
};

/** Цвета категорий — одни и те же в сетке, легенде и карточке элемента. */
export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  alkali: "#fca5a5",
  alkaline: "#fdba74",
  transition: "#fde68a",
  post: "#a7f3d0",
  metalloid: "#99f6e4",
  nonmetal: "#bfdbfe",
  halogen: "#c7d2fe",
  noble: "#e9d5ff",
  lanthanide: "#fbcfe8",
  actinide: "#f5d0fe",
};

export function findElement(query: string): ChemicalElement[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PERIODIC_ELEMENTS.filter(
    (element) =>
      element.symbol.toLowerCase() === q ||
      element.name.toLowerCase().includes(q) ||
      String(element.number) === q,
  ).slice(0, 8);
}
