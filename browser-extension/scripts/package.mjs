/**
 * Packages dist/ into public/downloads/medbiohim-importer.zip without extra deps.
 * Usage: npm run package (after npm run build)
 */
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const outDir = path.resolve(root, "..", "public", "downloads");
const outFile = path.join(outDir, "medbiohim-importer.zip");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function walk(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, name)));
    else if (entry.isFile()) files.push({ name, full });
  }
  return files;
}

const files = await walk(dist);
if (!files.length) throw new Error("dist/ is empty — run npm run build first");

const locals = [];
const centrals = [];
let offset = 0;

for (const file of files) {
  const data = await readFile(file.full);
  const compressed = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(file.name, "utf8");
  const crc = crc32(data);

  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  name.copy(central, 46);

  locals.push(local, compressed);
  centrals.push(central);
  offset += local.length + compressed.length;
}

const centralSize = centrals.reduce((sum, buffer) => sum + buffer.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

await mkdir(outDir, { recursive: true });
await writeFile(outFile, Buffer.concat([...locals, ...centrals, end]));
const size = (await stat(outFile)).size;
console.log(`Packaged ${files.length} files → ${path.relative(root, outFile)} (${(size / 1024).toFixed(1)} KB)`);
