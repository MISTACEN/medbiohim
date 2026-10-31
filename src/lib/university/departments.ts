/**
 * Каталог кафедр ДВГМУ — собран с официальной страницы
 * https://www.fesmu.ru/life/department/ (снимок 2026-10-31, открытая
 * разметка). Названия и адреса — дословно с источника; карточки кафедр
 * (контакты, РПД, методички) — следующий шаг fixtures-first.
 *
 * Live-фетч fesmu.ru сейчас ненадёжен (неполная цепочка сертификата —
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE), поэтому каталог статичен: структура
 * страницы кафедр меняется редко, а источник указан честно.
 */
export type DepartmentCatalogEntry = { name: string; slug: string; url: string };

export const DEPARTMENTS_CATALOG_SNAPSHOT = "2026-10-31";
export const DEPARTMENTS_CATALOG_SOURCE = "https://www.fesmu.ru/life/department/";

export const DEPARTMENTS: DepartmentCatalogEntry[] = [
  {
    "name": "Кафедра акушерства и гинекологии",
    "slug": "akusherstva-i-ginekologii",
    "url": "https://www.fesmu.ru/life/department/akusherstva-i-ginekologii/"
  },
  {
    "name": "Кафедра анестезиологии-реаниматологии, трансфузиологии и скорой медицинской помощи",
    "slug": "anesteziologii-reanimatologii-transfuziologii-i-skoroy-meditsinskoy-pomoshchi",
    "url": "https://www.fesmu.ru/life/department/anesteziologii-reanimatologii-transfuziologii-i-skoroy-meditsinskoy-pomoshchi/"
  },
  {
    "name": "Кафедра биологии и генетики",
    "slug": "biologii-i-genetiki",
    "url": "https://www.fesmu.ru/life/department/biologii-i-genetiki/"
  },
  {
    "name": "Кафедра биологической химии и клинической лабораторной диагностики",
    "slug": "kafedra-biologicheskoy-khimii-i-klinicheskoy-laboratornoy-diagnostiki",
    "url": "https://www.fesmu.ru/life/department/kafedra-biologicheskoy-khimii-i-klinicheskoy-laboratornoy-diagnostiki/"
  },
  {
    "name": "Кафедра внутренних болезней, гериатрии и инструментальной диагностики",
    "slug": "kafedra-vnutrennikh-bolezney-geriatrii-i-instrumentalnoy-diagnostiki",
    "url": "https://www.fesmu.ru/life/department/kafedra-vnutrennikh-bolezney-geriatrii-i-instrumentalnoy-diagnostiki/"
  },
  {
    "name": "Кафедра гигиены",
    "slug": "kafedra-gigieny",
    "url": "https://www.fesmu.ru/life/department/kafedra-gigieny/"
  },
  {
    "name": "Кафедра гистологии, эмбриологии и цитологии",
    "slug": "kafedra-gistologii-embriologii-i-tsitologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-gistologii-embriologii-i-tsitologii/"
  },
  {
    "name": "Кафедра госпитальной и факультетской педиатрии с курсом пропедевтики детских болезней",
    "slug": "kafedra-gospitalnoy-i-fakultetskoy-pediatrii-s-kursom-propedevtiki-detskikh-bolezney",
    "url": "https://www.fesmu.ru/life/department/kafedra-gospitalnoy-i-fakultetskoy-pediatrii-s-kursom-propedevtiki-detskikh-bolezney/"
  },
  {
    "name": "Кафедра госпитальной терапии",
    "slug": "kafedra-gospitalnoy-terapii",
    "url": "https://www.fesmu.ru/life/department/kafedra-gospitalnoy-terapii/"
  },
  {
    "name": "Кафедра дерматовенерологии",
    "slug": "kafedra-dermatovenerologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-dermatovenerologii/"
  },
  {
    "name": "Кафедра детской хирургии, травматологии и ортопедии",
    "slug": "kafedra-detskoy-khirurgii-travmatologii-i-ortopedii",
    "url": "https://www.fesmu.ru/life/department/kafedra-detskoy-khirurgii-travmatologii-i-ortopedii/"
  },
  {
    "name": "Кафедра дополнительного профессионального образования ИНПОА",
    "slug": "kafedra-dopolnitelnogo-professionalnogo-obrazovaniya-inpoa",
    "url": "https://www.fesmu.ru/life/department/kafedra-dopolnitelnogo-professionalnogo-obrazovaniya-inpoa/"
  },
  {
    "name": "Кафедра иностранных языков",
    "slug": "kafedra-inostrannykh-yazykov",
    "url": "https://www.fesmu.ru/life/department/kafedra-inostrannykh-yazykov/"
  },
  {
    "name": "Кафедра инфекционных болезней и эпидемиологии",
    "slug": "kafedra-infektsionnykh-bolezney-i-epidemiologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-infektsionnykh-bolezney-i-epidemiologii/"
  },
  {
    "name": "Кафедра клинической токсикологии и экстремальной медицины",
    "slug": "kafedra-klinicheskoy-toksikologii-i-ekstremalnoy-meditsiny",
    "url": "https://www.fesmu.ru/life/department/kafedra-klinicheskoy-toksikologii-i-ekstremalnoy-meditsiny/"
  },
  {
    "name": "Кафедра микробиологии, вирусологии и иммунологии",
    "slug": "kafedra-mikrobiologii-virusologii-i-immunologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-mikrobiologii-virusologii-i-immunologii/"
  },
  {
    "name": "Кафедра неврологии и нейрохирургии",
    "slug": "kafedra-nevrologii-i-neyrokhirurgii",
    "url": "https://www.fesmu.ru/life/department/kafedra-nevrologii-i-neyrokhirurgii/"
  },
  {
    "name": "Кафедра нормальной и патологической физиологии",
    "slug": "kafedra-normalnoy-i-patologicheskoy-fiziologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-normalnoy-i-patologicheskoy-fiziologii/"
  },
  {
    "name": "Кафедра нормальной и топографической анатомии с курсом оперативной хирургии",
    "slug": "kafedra-normalnoy-i-topograficheskoy-anatomii-s-kursom-operativnoy-khirurgii",
    "url": "https://www.fesmu.ru/life/department/kafedra-normalnoy-i-topograficheskoy-anatomii-s-kursom-operativnoy-khirurgii/"
  },
  {
    "name": "Кафедра общей и клинической хирургии",
    "slug": "kafedra-obshchey-i-klinicheskoy-khirurgii",
    "url": "https://www.fesmu.ru/life/department/kafedra-obshchey-i-klinicheskoy-khirurgii/"
  },
  {
    "name": "Кафедра общественного здоровья и здравоохранения",
    "slug": "kafedra-obshchestvennogo-zdorovya-i-zdravookhraneniya",
    "url": "https://www.fesmu.ru/life/department/kafedra-obshchestvennogo-zdorovya-i-zdravookhraneniya/"
  },
  {
    "name": "Кафедра онкологии",
    "slug": "kafedra-onkologii-s-kursom-khirurgii-i-endoskopii-dpo",
    "url": "https://www.fesmu.ru/life/department/kafedra-onkologii-s-kursom-khirurgii-i-endoskopii-dpo/"
  },
  {
    "name": "Кафедра организации и экономики фармации",
    "slug": "kafedra-organizatsii-i-ekonomiki-farmatsii",
    "url": "https://www.fesmu.ru/life/department/kafedra-organizatsii-i-ekonomiki-farmatsii/"
  },
  {
    "name": "Кафедра оториноларингологии",
    "slug": "kafedra-otorinolaringologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-otorinolaringologii/"
  },
  {
    "name": "Кафедра патологической анатомии и судебной медицины",
    "slug": "kafedra-patologicheskoy-anatomii-i-sudebnoy-meditsiny",
    "url": "https://www.fesmu.ru/life/department/kafedra-patologicheskoy-anatomii-i-sudebnoy-meditsiny/"
  },
  {
    "name": "Кафедра педагогики и психологии",
    "slug": "kafedra-pedagogiki-i-psikhologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-pedagogiki-i-psikhologii/"
  },
  {
    "name": "Кафедра педиатрии, неонатологии и перинатологии с курсом неотложной медицины",
    "slug": "kafedra-pediatrii-neonatologii-i-perinatologii-s-kursom-neotlozhnoy-meditsiny",
    "url": "https://www.fesmu.ru/life/department/kafedra-pediatrii-neonatologii-i-perinatologii-s-kursom-neotlozhnoy-meditsiny/"
  },
  {
    "name": "Кафедра поликлинической педиатрии с курсом детских инфекционных болезней",
    "slug": "kafedra-poliklinicheskoy-pediatrii-s-kursom-detskikh-infektsionnykh-bolezney",
    "url": "https://www.fesmu.ru/life/department/kafedra-poliklinicheskoy-pediatrii-s-kursom-detskikh-infektsionnykh-bolezney/"
  },
  {
    "name": "Кафедра пропедевтики внутренних болезней с курсом фтизиатрии",
    "slug": "kafedra-propedevtiki-vnutrennikh-bolezney-s-kursom-ftiziatrii",
    "url": "https://www.fesmu.ru/life/department/kafedra-propedevtiki-vnutrennikh-bolezney-s-kursom-ftiziatrii/"
  },
  {
    "name": "Кафедра психиатрии и наркологии",
    "slug": "kafedra-psikhiatrii-i-narkologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-psikhiatrii-i-narkologii/"
  },
  {
    "name": "Кафедра сестринского дела с курсом социальных дисциплин",
    "slug": "kafedra-sestrinskogo-dela-s-kursom-sotsialnykh-distsiplin",
    "url": "https://www.fesmu.ru/life/department/kafedra-sestrinskogo-dela-s-kursom-sotsialnykh-distsiplin/"
  },
  {
    "name": "Кафедра стоматологии детского возраста",
    "slug": "kafedra-stomatologii-detskogo-vozrasta",
    "url": "https://www.fesmu.ru/life/department/kafedra-stomatologii-detskogo-vozrasta/"
  },
  {
    "name": "Кафедра стоматологии ортопедической",
    "slug": "kafedra-stomatologii-ortopedicheskoy",
    "url": "https://www.fesmu.ru/life/department/kafedra-stomatologii-ortopedicheskoy/"
  },
  {
    "name": "Кафедра стоматологии терапевтической",
    "slug": "kafedra-stomatologii-terapevticheskoy",
    "url": "https://www.fesmu.ru/life/department/kafedra-stomatologii-terapevticheskoy/"
  },
  {
    "name": "Кафедра стоматологии хирургической и челюстно-лицевой хирургии",
    "slug": "kafedra-stomatologii-khirurgicheskoy-i-chelyustno-litsevoy-khirurgii",
    "url": "https://www.fesmu.ru/life/department/kafedra-stomatologii-khirurgicheskoy-i-chelyustno-litsevoy-khirurgii/"
  },
  {
    "name": "Кафедра терапии педиатрического и стоматологического факультетов",
    "slug": "kafedra-terapii-pediatricheskogo-i-stomatologicheskogo-fakultetov",
    "url": "https://www.fesmu.ru/life/department/kafedra-terapii-pediatricheskogo-i-stomatologicheskogo-fakultetov/"
  },
  {
    "name": "Кафедра травматологии и ортопедии",
    "slug": "kafedra-travmatologii-i-ortopedii",
    "url": "https://www.fesmu.ru/life/department/kafedra-travmatologii-i-ortopedii/"
  },
  {
    "name": "Кафедра урологии и нефрологии",
    "slug": "kafedra-urologii-i-nefrologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-urologii-i-nefrologii/"
  },
  {
    "name": "Кафедра факультетской и поликлинической терапии с курсом эндокринологии",
    "slug": "kafedra-fakultetskoy-i-poliklinicheskoy-terapii-s-kursom-endokrinologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-fakultetskoy-i-poliklinicheskoy-terapii-s-kursom-endokrinologii/"
  },
  {
    "name": "Кафедра фармации и фармакологии",
    "slug": "kafedra-farmatsii-i-farmakologii",
    "url": "https://www.fesmu.ru/life/department/kafedra-farmatsii-i-farmakologii/"
  },
  {
    "name": "Кафедра физики, математики и информатики",
    "slug": "kafedra-fiziki-matematiki-i-informatiki",
    "url": "https://www.fesmu.ru/life/department/kafedra-fiziki-matematiki-i-informatiki/"
  },
  {
    "name": "Кафедра физического воспитания и здоровья",
    "slug": "kafedra-fizicheskogo-vospitaniya-i-zdorovya",
    "url": "https://www.fesmu.ru/life/department/kafedra-fizicheskogo-vospitaniya-i-zdorovya/"
  },
  {
    "name": "Кафедра физической и реабилитационной медицины",
    "slug": "kafedra-fizicheskoy-i-reabilitatsionnoy-meditsiny",
    "url": "https://www.fesmu.ru/life/department/kafedra-fizicheskoy-i-reabilitatsionnoy-meditsiny/"
  },
  {
    "name": "Кафедра философии",
    "slug": "kafedra-filosofii",
    "url": "https://www.fesmu.ru/life/department/kafedra-filosofii/"
  },
  {
    "name": "Кафедра химии",
    "slug": "kafedra-khimii",
    "url": "https://www.fesmu.ru/life/department/kafedra-khimii/"
  }
];
