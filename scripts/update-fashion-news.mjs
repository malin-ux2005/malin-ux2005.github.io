import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FEED_URL = "https://www.theguardian.com/fashion/rss";
const OUTPUT_FILE = resolve(process.argv[2] || "fashion-news.json");

function decode(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const response = await fetch(FEED_URL, {
  headers: { "User-Agent": "ViwanticaFashionTicker/1.0" },
});

if (!response.ok) throw new Error(`Fashion feed returned ${response.status}`);

const xml = await response.text();
const items = [...xml.matchAll(/<item[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/gi)]
  .slice(0, 10)
  .map((match) => ({
    title: decode(match[1]).trim(),
    link: decode(match[2]).trim(),
    publishedAt: decode(match[3]).trim(),
  }))
  .filter((item) => item.title && item.link.startsWith("https://"));

if (items.length < 2) throw new Error("Fashion feed did not contain enough valid stories");

const existing = await readFile(OUTPUT_FILE, "utf8").then(JSON.parse).catch(() => null);
if (existing && JSON.stringify(existing.items) === JSON.stringify(items)) {
  console.log("Fashion news is already current");
} else {
  await writeFile(OUTPUT_FILE, `${JSON.stringify({
    source: "The Guardian Fashion",
    updatedAt: new Date().toISOString(),
    items,
  }, null, 2)}\n`, "utf8");
}
