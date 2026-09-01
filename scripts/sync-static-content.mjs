import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const SHEET_ID = "1C8xVNcmo9b42jLUYL6Bma7KD5FVxYaLWpOO26psYzxM";
const CATALOG_SHEET = "Сайт — Каталог";
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR || "public");
const DATA_DIR = join(PUBLIC_DIR, "data");
const IMAGE_DIR = join(PUBLIC_DIR, "catalog-images");
const GENERATED_DIR = process.env.GENERATED_DIR === "false" ? null : resolve(process.env.GENERATED_DIR || "lib/generated");
const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const PUBLIC_DISK_URL = /^https:\/\/(?:disk\.yandex\.[^/]+|yadi\.sk)\//i;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cellText(cell) {
  if (!cell) return "";
  if (typeof cell.f === "string" && cell.f) return cell.f.trim();
  return cell.v == null ? "" : String(cell.v).trim();
}

async function fetchSheet({ gid, sheet, range }) {
  const endpoint = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  endpoint.searchParams.set("tqx", "out:json");
  endpoint.searchParams.set("_", String(Date.now()));
  endpoint.searchParams.set("range", range);
  endpoint.searchParams.set("headers", "1");
  if (gid) endpoint.searchParams.set("gid", gid);
  if (sheet) endpoint.searchParams.set("sheet", sheet);
  const response = await fetch(endpoint, { headers: { Accept: "text/plain" } });
  if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
  const source = await response.text();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Google Sheets returned malformed data");
  const payload = JSON.parse(source.slice(start, end + 1));
  const columns = payload.table?.cols || [];
  return {
    headers: columns.map((column) => column.label?.trim() || ""),
    rows: (payload.table?.rows || []).map((row) => columns.map((_, index) => cellText(row.c?.[index] || null))),
  };
}

function rowReader(table) {
  const columns = new Map(table.headers.map((header, index) => [header, index]));
  return table.rows.map((row) => ({
    cell: (name) => row[columns.get(name) ?? -1]?.trim() || "",
  }));
}

function dedupeCatalogTable(table) {
  const columns = new Map(table.headers.map((header, index) => [header.trim(), index]));
  const cell = (row, name) => row[columns.get(name) ?? -1]?.trim() || "";
  const selected = new Map();

  table.rows.forEach((row, index) => {
    const id = cell(row, "ID вещи");
    if (!id) return;
    const key = id.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
    const score = row.reduce((total, value) => total + (value?.trim() ? 1 : 0), 0)
      + (cell(row, "Название для сайта") ? 1000 : 0)
      + (cell(row, "Главное фото — имя файла") ? 250 : 0)
      + (cell(row, "Папка фото — Я.Диск") ? 150 : 0)
      + (cell(row, "Префикс фото") ? 100 : 0)
      + (cell(row, "Статус вещи") ? 50 : 0)
      + (cell(row, "Показывать на сайте") ? 50 : 0)
      + (cell(row, "Цена, ₽") ? 50 : 0);
    const current = selected.get(key);
    if (!current || score > current.score) selected.set(key, { row, score, index: current?.index ?? index });
  });

  return {
    headers: table.headers,
    rows: [...selected.values()].sort((a, b) => a.index - b.index).map(({ row }) => row),
  };
}

function publicCatalogTable(table) {
  // Only explicitly approved storefront fields enter the public build. Internal
  // sales, purchasing, profit and manager columns stay private even if columns
  // are inserted or moved in the source sheet.
  const publicHeaders = new Set([
    "ID вещи", "Превью", "Статус вещи", "Готовность карточки", "Показывать на сайте", "На главной",
    "Название для сайта", "Бренд", "Раздел", "Категория", "Линейка", "Размер на бирке",
    "Размер для фильтра", "Цвет", "Цена, ₽", "Состояние", "Материал", "Сезон", "Замеры",
    "Описание для сайта", "Папка фото — Я.Диск", "Префикс фото", "Главное фото — имя файла",
    "Дата добавления", "Порядок на сайте", "Пол", "Гендер", "Для кого", "Мужское / Женское",
    "Мужское/женское",
  ]);
  const indexes = table.headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => publicHeaders.has(header));
  const headers = indexes.map(({ header }) => header);
  const folderIndex = headers.indexOf("Папка фото — Я.Диск");
  return {
    headers,
    rows: table.rows.map((row) => {
      const publicRow = indexes.map(({ index }) => row[index] || "");
      if (folderIndex >= 0 && PUBLIC_DISK_URL.test(publicRow[folderIndex])) {
        publicRow[folderIndex] = folderHash(publicRow[folderIndex]);
      }
      return publicRow;
    }),
  };
}

function contentTheme(value) {
  const normalized = value.toLowerCase();
  if (normalized.includes("крас")) return "red";
  if (normalized.includes("свет")) return "light";
  return "dark";
}

function folderHash(publicKey) {
  return createHash("sha1").update(publicKey).digest("hex").slice(0, 10);
}

function safeImageName(name) {
  const extension = name.match(/\.(avif|gif|jpe?g|png|webp)$/i)?.[1]?.toLowerCase() || "jpg";
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_.-]+/gu, "_").slice(0, 120);
  return `${stem || createHash("sha1").update(name).digest("hex").slice(0, 16)}.${extension}`;
}

function isEnabled(value) {
  return !/^(?:нет|no|false|0)$/i.test(value.trim());
}

function canonicalCollection(value) {
  return /(?:kar+am|car+am|карам)/i.test(value) ? "Karrrambaby" : value;
}

async function listYandexFolder(publicKey) {
  const endpoint = new URL("https://cloud-api.yandex.net/v1/disk/public/resources");
  endpoint.searchParams.set("public_key", publicKey);
  endpoint.searchParams.set("limit", "1000");
  endpoint.searchParams.set("fields", "_embedded.total,_embedded.items.name,_embedded.items.type,_embedded.items.preview,_embedded.items.file,_embedded.items.sha256,_embedded.items.md5");
  endpoint.searchParams.set("preview_size", "XXL");
  endpoint.searchParams.set("preview_crop", "false");

  const items = [];
  let offset = 0;
  let total = 1;
  while (offset < total && offset < 5000) {
    endpoint.searchParams.set("offset", String(offset));
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Yandex Disk returned ${response.status}`);
    const payload = await response.json();
    const page = payload._embedded?.items || [];
    items.push(...page);
    total = payload._embedded?.total || page.length;
    if (!page.length) break;
    offset += page.length;
  }
  return items.filter((item) => item.type === "file" && item.name && IMAGE_FILE.test(item.name) && (item.preview || item.file));
}

async function runPool(tasks, concurrency = 10) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}

function parseCbrCurrency(source, code) {
  const block = source.match(new RegExp(`<CharCode>${code}<\\/CharCode>[\\s\\S]*?<Nominal>(\\d+)<\\/Nominal>[\\s\\S]*?<Value>([\\d,]+)<\\/Value>`, "i"));
  if (!block) return null;
  const nominal = Number(block[1]);
  const value = Number(block[2].replace(",", "."));
  return nominal > 0 && value > 0 ? value / nominal : null;
}

async function fetchCurrencyRates(previous) {
  try {
    const response = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", { headers: { Accept: "application/xml,text/xml" } });
    if (!response.ok) throw new Error(`CBR returned ${response.status}`);
    const xml = await response.text();
    const rubPerUsd = parseCbrCurrency(xml, "USD");
    const rubPerCny = parseCbrCurrency(xml, "CNY");
    if (!rubPerUsd || !rubPerCny) throw new Error("CBR response has no USD/CNY rates");
    return { rubPerUsd, rubPerCny, updatedAt: new Date().toISOString(), source: "cbr.ru" };
  } catch {
    return previous?.rubPerUsd && previous?.rubPerCny
      ? previous
      : { rubPerUsd: 82, rubPerCny: 11.4, updatedAt: new Date().toISOString(), source: "fallback" };
  }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(IMAGE_DIR, { recursive: true });

  const [catalog, bannerTable, collectionTable] = await Promise.all([
    // Read the unfiltered mirror instead of the editor-facing catalog. Google
    // Visualization respects an active basic filter, which used to make the
    // public site lose most products whenever somebody filtered the table.
    fetchSheet({ sheet: CATALOG_SHEET, range: "A1:AH1000" }),
    fetchSheet({ sheet: "Сайт — Баннеры — ПК", range: "A1:K200" }),
    fetchSheet({ sheet: "Сайт — Коллекции", range: "A1:K200" }),
  ]);
  const uniqueCatalog = dedupeCatalogTable(catalog);

  const wanted = new Map();
  const remember = (publicKey, matcher) => {
    if (!PUBLIC_DISK_URL.test(publicKey)) return;
    const list = wanted.get(publicKey) || [];
    list.push(matcher);
    wanted.set(publicKey, list);
  };

  for (const { cell } of rowReader(uniqueCatalog)) {
    const folder = cell("Папка фото — Я.Диск");
    const prefix = cell("Префикс фото");
    const mainPhoto = cell("Главное фото — имя файла");
    if (prefix) remember(folder, (name) => name.startsWith(`${prefix}_`));
    else if (mainPhoto) remember(folder, (name) => name === mainPhoto);
  }
  for (const table of [bannerTable, collectionTable]) {
    for (const { cell } of rowReader(table)) {
      const folder = cell("Фото — URL / папка Я.Диск");
      const fileName = cell("Имя файла (если Я.Диск)");
      if (fileName) remember(folder, (name) => name === fileName);
    }
  }

  const metaPath = join(DATA_DIR, "image-meta.json");
  const oldMeta = await readJson(metaPath, {});
  const oldManifest = await readJson(join(DATA_DIR, "image-manifest.json"), {});
  const curatedManifest = await readJson(join(DATA_DIR, "curated-cutouts.json"), { paths: [] });
  const curatedPaths = new Set((curatedManifest.paths || []).map((path) => String(path).replace(/^\/+/, "")));
  const nextMeta = {};
  const manifest = {};
  const downloadTasks = [];

  for (const [publicKey, matchers] of wanted) {
    const hash = folderHash(publicKey);
    const oldFolderMeta = oldMeta[hash] || oldMeta[publicKey] || {};
    let items;
    try {
      items = (await listYandexFolder(publicKey)).filter((item) => matchers.some((matches) => matches(item.name)));
    } catch (error) {
      manifest[hash] = oldManifest[hash] || oldManifest[publicKey] || {};
      nextMeta[hash] = oldFolderMeta;
      console.warn(`Keeping cached images for ${hash}: ${error instanceof Error ? error.message : "Yandex Disk error"}`);
      continue;
    }
    manifest[hash] = {};
    nextMeta[hash] = {};
    for (const item of items) {
      const fileName = safeImageName(item.name);
      const curatedRelative = `catalog-cutouts/${hash}/${fileName.replace(/\.[^.]+$/, "")}.png`;
      const curatedOutput = join(PUBLIC_DIR, curatedRelative);
      if (curatedPaths.has(curatedRelative) && await exists(curatedOutput)) {
        const relativePath = `/${curatedRelative}`;
        const sourceHash = item.sha256 || item.md5 || item.file || item.preview;
        manifest[hash][item.name] = relativePath;
        nextMeta[hash][item.name] = { sourceHash, path: relativePath, curated: true };
        continue;
      }
      const relativePath = `/catalog-images/${hash}/${fileName}`;
      const outputPath = join(IMAGE_DIR, hash, fileName);
      const sourceHash = item.sha256 || item.md5 || item.file || item.preview;
      manifest[hash][item.name] = relativePath;
      nextMeta[hash][item.name] = { sourceHash, path: relativePath };
      if (oldFolderMeta[item.name]?.sourceHash === sourceHash && await exists(outputPath)) continue;
      downloadTasks.push(async () => {
        const response = await fetch(item.preview || item.file, { headers: { Accept: "image/jpeg,image/*" } });
        if (!response.ok) throw new Error(`Image ${item.name} returned ${response.status}`);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
      });
    }
  }

  await runPool(downloadTasks);

  const localImage = (source, fileName) => {
    if (PUBLIC_DISK_URL.test(source)) return manifest[folderHash(source)]?.[fileName] || "";
    return source;
  };
  const banners = rowReader(bannerTable)
    .filter(({ cell }) => isEnabled(cell("Активен")) && cell("Заголовок"))
    .map(({ cell }) => {
      const order = Number(cell("Порядок")) || 9999;
      return {
        eyebrow: cell("Маркер"),
        title: cell("Заголовок"),
        text: cell("Текст"),
        action: cell("Текст кнопки") || "Подробнее",
        href: cell("Ссылка") || "#catalog",
        imageUrl: localImage(cell("Фото — URL / папка Я.Диск"), cell("Имя файла (если Я.Диск)")),
        imagePosition: cell("Фокус картинки") || "50% 50%",
        theme: contentTheme(cell("Тема")),
        order,
      };
    })
    .sort((a, b) => a.order - b.order);

  const collections = rowReader(collectionTable)
    .filter(({ cell }) => isEnabled(cell("Активна")) && cell("Название"))
    .map(({ cell }) => ({
      name: canonicalCollection(cell("Название")),
      code: cell("Код"),
      text: cell("Описание"),
      filter: canonicalCollection(cell("Линейка в товарах") || cell("Название")),
      imageUrl: localImage(cell("Фото — URL / папка Я.Диск"), cell("Имя файла (если Я.Диск)")),
      theme: contentTheme(cell("Тема")),
      href: cell("Ссылка"),
      buttonLabel: cell("Надпись кнопки"),
      order: Number(cell("Порядок")) || 9999,
    }))
    .sort((a, b) => a.order - b.order);

  const generatedAt = new Date().toISOString();
  const ratesPath = join(DATA_DIR, "currency-rates.json");
  const currencyRates = await fetchCurrencyRates(await readJson(ratesPath, null));
  const catalogSnapshot = { ...publicCatalogTable(uniqueCatalog), generatedAt };
  const siteContentSnapshot = { banners, collections, generatedAt };
  const newsSnapshot = await readJson(join(PUBLIC_DIR, "fashion-news.json"), { items: [] });
  const writes = [
    writeJson(join(DATA_DIR, "catalog-snapshot.json"), catalogSnapshot),
    writeJson(join(DATA_DIR, "site-content.json"), siteContentSnapshot),
    writeJson(join(DATA_DIR, "image-manifest.json"), manifest),
    writeJson(metaPath, nextMeta),
    writeJson(ratesPath, currencyRates),
  ];
  if (GENERATED_DIR) {
    writes.push(
      writeJson(join(GENERATED_DIR, "catalog-snapshot.json"), catalogSnapshot),
      writeJson(join(GENERATED_DIR, "site-content.json"), siteContentSnapshot),
      writeJson(join(GENERATED_DIR, "image-manifest.json"), manifest),
      writeJson(join(GENERATED_DIR, "fashion-news.json"), newsSnapshot),
      writeJson(join(GENERATED_DIR, "currency-rates.json"), currencyRates),
    );
  }
  await Promise.all(writes);

  console.log(`Synced ${uniqueCatalog.rows.length} unique catalog rows (${catalog.rows.length} source rows), ${Object.values(manifest).reduce((sum, files) => sum + Object.keys(files).length, 0)} images, ${downloadTasks.length} downloads.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
