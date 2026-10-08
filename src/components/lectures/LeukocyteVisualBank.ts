export type LeukocyteVisualCell =
  | "neutrophils"
  | "lymphocytes"
  | "monocytes"
  | "eosinophils"
  | "basophils";

export type VerifiedLocalPhoto = {
  cell: LeukocyteVisualCell;
  trainerId: string;
  archiveFileName: string;
  sourceArchives: ["content.zip", "Гистология.zip"];
  singleCellForIdentification: true;
};

export type VerifiedExternalPhoto = {
  cell: LeukocyteVisualCell;
  imageUrl: string;
  sourceUrl: string;
  exactSourceTitle: string;
  targetDescription: string;
  workingFocus: { x: number; y: number; scale: number };
};

export const GUARANTEED_LEUKOCYTE_ORDER: LeukocyteVisualCell[] = [
  "neutrophils",
  "lymphocytes",
  "monocytes",
  "eosinophils",
  "basophils",
];

export const VERIFIED_LOCAL_SINGLE_PHOTOS: VerifiedLocalPhoto[] = [
  {
    cell: "neutrophils",
    trainerId: "feed-prep-867b72a4b6",
    archiveFileName: "5.Соед.тк. Кровь. Нейтрофил..jpg",
    sourceArchives: ["content.zip", "Гистология.zip"],
    singleCellForIdentification: true,
  },
  {
    cell: "lymphocytes",
    trainerId: "feed-prep-5a224c48f5",
    archiveFileName: "5.Соед.тк. Кровь.Лимфоцит..jpg",
    sourceArchives: ["content.zip", "Гистология.zip"],
    singleCellForIdentification: true,
  },
  {
    cell: "monocytes",
    trainerId: "feed-prep-bca30caf3b",
    archiveFileName: "5.Соед.тк. Кровь.Моноцит..jpg",
    sourceArchives: ["content.zip", "Гистология.zip"],
    singleCellForIdentification: true,
  },
] as const;

export const EXCLUDED_LOCAL_IDENTIFICATION_PHOTOS = [
  {
    archiveFileName: "5.Соед.тк. Кровь. Нейтр. и эозиноф..jpg",
    reason: "В кадре одновременно нейтрофил и эозинофил.",
  },
  {
    archiveFileName: "5.Соед.тк. Кровь. Эозинофил и нейтр..jpg",
    reason: "В кадре одновременно эозинофил и нейтрофил.",
  },
  {
    archiveFileName: "5.Соед.тк. Кровь.Лимфоцит и моноцит..jpg",
    reason: "В кадре одновременно лимфоцит и моноцит.",
  },
  {
    archiveFileName: "5.Соед.тк. Кровь.Лимфоциты..jpg",
    reason: "В кадре несколько лимфоцитов; это не однозначный одиночный пример.",
  },
  {
    archiveFileName: "5.Соед.тк. Кровь.Тромбоциты..jpg",
    reason: "Это препарат тромбоцитов, а текущая карточка проверяет пять видов лейкоцитов и процент лейкоцитарной формулы.",
  },
] as const;

export const VERIFIED_EXTERNAL_PHOTOS: VerifiedExternalPhoto[] = [
  {
    cell: "neutrophils",
    imageUrl: "https://webpath.med.utah.edu/jpeg5/HEME002.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM020.html",
    exactSourceTitle: "Normal peripheral blood, segmented neutrophil and lymphocyte, high power microscopic.",
    targetDescription: "В рабочем кадре сфокусирован сегментоядерный нейтрофил; исходный файл также содержит лимфоцит.",
    workingFocus: { x: 73, y: 44, scale: 2.7 },
  },
  {
    cell: "lymphocytes",
    imageUrl: "https://webpath.med.utah.edu/jpeg5/HEME002.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM020.html",
    exactSourceTitle: "Normal peripheral blood, segmented neutrophil and lymphocyte, high power microscopic.",
    targetDescription: "В рабочем кадре сфокусирован лимфоцит; исходный файл также содержит сегментоядерный нейтрофил.",
    workingFocus: { x: 35, y: 62, scale: 2.7 },
  },
  {
    cell: "monocytes",
    imageUrl: "https://webpath.med.utah.edu/jpeg5/HEME003.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM021.html",
    exactSourceTitle: "Normal peripheral blood, monocyte, high power microscopic.",
    targetDescription: "Источник прямо обозначен как препарат с моноцитом; это наиболее однозначный внешний источник для моноцита.",
    workingFocus: { x: 50, y: 50, scale: 1 },
  },
  {
    cell: "eosinophils",
    imageUrl: "https://webpath.med.utah.edu/jpeg5/HEME004.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM022.html",
    exactSourceTitle: "Normal peripheral blood, eosinophil and lymphocyte, high power microscopic.",
    targetDescription: "В рабочем кадре сфокусирован эозинофил; исходный файл также содержит небольшой лимфоцит.",
    workingFocus: { x: 50, y: 50, scale: 2.2 },
  },
  {
    cell: "basophils",
    imageUrl: "https://webpath.med.utah.edu/jpeg5/HEME005.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM023.html",
    exactSourceTitle: "Normal peripheral blood, basophil, band neutrophil and lymphocyte, high power microscopic.",
    targetDescription: "В рабочем кадре сфокусирован базофил; исходный файл также содержит палочкоядерный нейтрофил и лимфоцит.",
    workingFocus: { x: 50, y: 50, scale: 2.2 },
  },
] as const;
