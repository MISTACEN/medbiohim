import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("data/preparations-bonus-2026-11.processed.json", root), "utf8"),
);
const mapping = JSON.parse(readFileSync(new URL("data/preparations-bonus-2026-11.json", root), "utf8"));

const publicDir = new URL("public/library/lectures/gistologiya/preparaty-bonus/", root);

test("обработаны все 42 файла и 12 препаратов", () => {
  assert.equal(manifest.totals.preparations, 12);
  assert.equal(manifest.totals.files, 42);
  assert.equal(manifest.totals.micro, 30);
  const all = manifest.preparations.flatMap((item) => item.images.map((image) => image.file));
  assert.equal(all.length, 42);
  assert.equal(new Set(all).size, 42);
});

test("кадры «в окуляр» — квадрат 1200 px, этикетки не крупнее 1200", async () => {
  for (const preparation of manifest.preparations) {
    for (const image of preparation.images) {
      const file = fileURLToPath(new URL(image.file, publicDir));
      assert.ok(existsSync(file), `нет файла ${image.file}`);
      const meta = await sharp(file).metadata();
      assert.ok(meta.width <= 1200, `${image.file}: ширина ${meta.width}`);
      if (image.role === "micro") {
        assert.equal(meta.width, 1200, `${image.file}: ширина ${meta.width}`);
        assert.equal(meta.height, 1200, `${image.file}: высота ${meta.height}`);
      }
    }
  }
});

test("сопоставленные препараты совпадают с исходным mapping", () => {
  const mapped = new Map(mapping.mapped.map((item) => [item.slug, item]));
  assert.equal(manifest.preparations.length, mapped.size);
  for (const preparation of manifest.preparations) {
    const source = mapped.get(preparation.slug);
    assert.ok(source, `лишний препарат ${preparation.slug}`);
    const micro = preparation.images.filter((image) => image.role === "micro");
    assert.equal(micro.length, source.shots.length, `${preparation.slug}: снимков ${micro.length}`);
    assert.ok(preparation.images.some((image) => image.role === "label"), `${preparation.slug}: нет этикетки`);
  }
});

test("у кадров «в окуляр» приемлемая яркость", () => {
  for (const preparation of manifest.preparations) {
    for (const image of preparation.images.filter((item) => item.role === "micro")) {
      assert.ok(image.brightness >= 60, `${image.file}: яркость ${image.brightness}`);
    }
  }
});
