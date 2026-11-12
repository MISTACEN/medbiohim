// Собирает материалы для повторения: миниатюры электронограмм и колоду Anki.
// Запуск: node tools/study/build.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), "utf8"));

const emSrc = "public/library/lectures/gistologiya/elektronogrammy";
const emOut = "public/study/img";
const tsvOut = "docs/study/anki-histology-kr.tsv";

const clean = (s) => String(s ?? "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");

async function buildImages(ems) {
  await mkdir(path.join(root, emOut), { recursive: true });
  for (const em of ems) {
    const name = em.file.replace(/\.png$/i, ".jpg");
    await sharp(path.join(root, emSrc, em.file))
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(path.join(root, emOut, name));
  }
  return ems.length;
}

function bankCards(bank, tag) {
  const rows = [];
  for (const q of bank.questions || []) {
    const options = Array.isArray(q.options) ? q.options : [];
    const ans = String(q.answer ?? "").trim();
    if (!ans) continue;
    const front = `<b>${clean(q.text)}</b>` +
      (options.length ? "<br>" + options.map((o, i) => `${i + 1}) ${clean(o)}`).join("<br>") : "");
    let back;
    if (options.length) {
      const idx = Number(ans) - 1;
      if (!(idx >= 0 && idx < options.length)) continue;
      back = `<b>${clean(options[idx])}</b>`;
    } else {
      back = `<b>${clean(ans)}</b>`;
    }
    rows.push({ front, back, tag: `${tag} тест-${q.number}` });
  }
  return rows;
}

async function main() {
  const ems = await readJson("public/content/study/electronograms.json");
  const emCount = await buildImages(ems);

  const rows = [];
  for (const em of ems) {
    rows.push({
      front: `<img src="${em.file.replace(/\.png$/i, ".jpg")}"><br>Электронограмма №${em.n}. Назови и подпиши структуры.`,
      back: `<b>№${em.n}. ${clean(em.name)}</b><br><br>${clean(em.labels)}<br><br><i>Теория:</i> ${clean(em.theory)}`,
      tag: "гистология::электронограммы",
    });
  }

  const banks = [
    { file: "public/content/histology/obschaya-gistologiya.json", bank: "Нервная ткань", tag: "гистология::нервная_ткань" },
    { file: "public/content/histology/citologiya-embriologiya.json", bank: "Цитология: тесты закрытого типа", tag: "гистология::цитология" },
    { file: "public/content/histology/citologiya-embriologiya.json", bank: "Цитология: тесты открытого типа", tag: "гистология::цитология_открытые" },
  ];
  for (const spec of banks) {
    const data = await readJson(spec.file);
    const bank = (data.banks || []).find((b) => b.title === spec.bank);
    if (!bank) throw new Error(`Не найден банк: ${spec.bank}`);
    rows.push(...bankCards(bank, spec.tag));
  }

  const tsv = [
    "#separator:tab",
    "#html:true",
    "#tags column:3",
    ...rows.map((r) => [r.front, r.back, r.tag].join("\t")),
  ].join("\n") + "\n";

  await mkdir(path.join(root, "docs/study"), { recursive: true });
  await writeFile(path.join(root, tsvOut), tsv, "utf8");

  console.log(`images: ${emCount}`);
  console.log(`cards: ${rows.length} (электронограммы ${ems.length})`);
  console.log(`tsv: ${tsvOut}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
