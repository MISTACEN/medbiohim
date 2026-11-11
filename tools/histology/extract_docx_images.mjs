// Извлекает картинку из DOCX-электронограммы кафедры в электронный каталог
// лекций, чтобы в тексте лекции картинка стояла рядом с описанием, а не
// отдельной галереей в конце. DOCX — это zip, картинки лежат в word/media.
//
// Запуск: node tools/histology/extract_docx_images.mjs [--dry]
// Источник по умолчанию: C:\Users\<user>\Desktop\Гистология
// (папки «1_Экзаменационные электронограммы…» и «2_Схемы и таблицы…»).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

const DRY = process.argv.includes("--dry");
const HOME = process.env.USERPROFILE || os.homedir();
const SRC = path.join(HOME, "Desktop", "Гистология");
const OUT = path.join(process.cwd(), "public", "library", "lectures", "gistologiya", "elektronogrammy");

/** docx-файл → имя картинки в каталоге лекций (латиницей, как остальные). */
// В части docx кафедры картинки вставлены как EMF (вектор Word): браузер их не
// покажет, а конвертера в окружении нет. Такие записи просто пропускаются —
// для этих тем берём растровые фото препаратов из «5_Фотографии препаратов».
const MAP = [
  {
    dir: "1_Экзаменационные электронограммы_РАСПЕЧАТАТЬ ВСЕ!",
    docx: "Поперечный срез миелинового нервного волокна.docx",
    out: "18-mielinovoe-volokno-poperechnoe.png",
  },
  {
    dir: "1_Экзаменационные электронограммы_РАСПЕЧАТАТЬ ВСЕ!",
    docx: "Узловой перехват  (Ранвье)  в нервном волокне седалищного нерва.docx",
    out: "19-uzlovoj-perehvat-ranve.png",
  },
  {
    dir: "1_Экзаменационные электронограммы_РАСПЕЧАТАТЬ ВСЕ!",
    docx: "Нервно-мышечный синапс.docx",
    out: "20-nervno-myshechnyj-sinaps.png",
  },
  {
    dir: "1_Экзаменационные электронограммы_РАСПЕЧАТАТЬ ВСЕ!",
    docx: "Дендриты фоторецепторных палочковых нейронов сетчатки глаза.docx",
    out: "21-dendrity-fotoreceptorov.png",
  },
];

function pickLargestMedia(zip) {
  const media = Object.keys(zip.files).filter((name) => /^word\/media\/[^/]+\.(png|jpe?g|gif|emf|wmf)$/i.test(name));
  let best = null;
  for (const name of media) {
    const size = zip.files[name]._data?.uncompressedSize || 0;
    if (!best || size > best.size) best = { name, size };
  }
  return best;
}

fs.mkdirSync(OUT, { recursive: true });
let saved = 0;

for (const item of MAP) {
  const file = path.join(SRC, item.dir, item.docx);
  if (!fs.existsSync(file)) {
    console.log(`нет файла: ${item.docx}`);
    continue;
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const best = pickLargestMedia(zip);
  if (!best) {
    console.log(`нет картинок: ${item.docx}`);
    continue;
  }
  const ext = path.extname(best.name).toLowerCase();
  if (ext === ".wmf" || ext === ".emf") {
    console.log(`пропуск: ${item.docx} — ${ext} (векторный формат, браузер не покажет)`);
    continue;
  }
  const bytes = await zip.files[best.name].async("nodebuffer");
  const kb = Math.round(bytes.length / 1024);
  console.log(`${item.out} ← ${best.name} (${kb} KB)`);
  if (!DRY) fs.writeFileSync(path.join(OUT, item.out), bytes);
  saved += 1;
}

console.log(`готово: ${saved} файлов${DRY ? " (dry)" : ""} → ${path.relative(process.cwd(), OUT)}`);
