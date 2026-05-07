import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "src");
const manifestsDir = path.join(rootDir, "manifests");
const distDir = path.join(rootDir, "dist");
const targets = new Set(["chrome", "firefox"]);
const crcTable = createCrcTable();

const args = process.argv.slice(2);

try {
  if (args[0] === "zip") {
    const target = requireTarget(args[1]);
    await buildTarget(target);
    await zipTarget(target);
  } else if (args[0]) {
    await buildTarget(requireTarget(args[0]));
  } else {
    await buildTarget("chrome");
    await buildTarget("firefox");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function requireTarget(target) {
  if (!targets.has(target)) {
    throw new Error("Usage: node scripts/build.mjs [chrome|firefox|zip chrome|zip firefox]");
  }

  return target;
}

async function buildTarget(target) {
  const targetDir = path.join(distDir, target);
  const manifestSource = path.join(manifestsDir, `manifest.${target}.json`);
  const manifestOutput = path.join(targetDir, "manifest.json");

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(srcDir, targetDir, { recursive: true });
  await fs.copyFile(manifestSource, manifestOutput);

  if (target === "chrome") {
    await validateChromeManifest(manifestOutput);
  }

  console.log(`Built ${target} -> ${path.relative(rootDir, targetDir)}`);
}

async function validateChromeManifest(manifestPath) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  if (manifest.browser_specific_settings) {
    throw new Error("Chrome manifest must not contain browser_specific_settings.");
  }

  if (manifest.permissions?.includes("contextualIdentities")) {
    throw new Error("Chrome manifest must not contain contextualIdentities.");
  }
}

async function zipTarget(target) {
  const targetDir = path.join(distDir, target);
  const manifest = JSON.parse(await fs.readFile(path.join(targetDir, "manifest.json"), "utf8"));
  const zipPath = path.join(distDir, `homebase-${target}-${manifest.version}.zip`);
  const files = await collectFiles(targetDir);

  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(zipPath, createZip(files));
  console.log(`Created ${path.relative(rootDir, zipPath)}`);
}

async function collectFiles(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, baseDir));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, absolutePath).replaceAll(path.sep, "/");
      const stat = await fs.stat(absolutePath);

      files.push({
        path: relativePath,
        modified: stat.mtime,
        data: await fs.readFile(absolutePath)
      });
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const { date, time } = toDosDateTime(file.modified);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function toDosDateTime(dateValue) {
  const date = new Date(dateValue);
  const year = Math.max(date.getFullYear(), 1980);

  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[i] = value >>> 0;
  }

  return table;
}
