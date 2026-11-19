import * as cheerio from "cheerio";

export type Extracted = {
  name: string;
  price: number | null;
  currency: string | null;
  store: string;
  images: string[];
  url: string;
};

const JUNK = /(logo|icon|sprite|badge|payment|flag|avatar|placeholder|blank|pixel|spacer|tracking|loader|loading|favicon|rating|star|arrow|chevron|social|facebook|twitter|instagram|pinterest|klarna|afterpay|paypal|visa|mastercard)/i;

function abs(src: string | undefined | null, base: string): string | null {
  if (!src) return null;
  const s = src.trim();
  if (!s || s.startsWith("data:") || s.startsWith("blob:")) return null;
  try {
    const u = new URL(s, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function largestFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = size ? parseFloat(size) * (size.endsWith("x") ? 1000 : 1) : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url;
}

// Two links to the same photo at different sizes should only show once.
function photoKey(u: string): string {
  try {
    const url = new URL(u);
    let p = url.pathname
      .replace(/_(\d+x\d*|\d*x\d+|small|medium|large|grande|compact|master)(?=\.)/gi, "")
      .replace(/\/(w|h|c|q)_[^/]+/g, "");
    return url.hostname + p;
  } catch {
    return u;
  }
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function findProducts(node: unknown, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findProducts(n, out));
    return out;
  }
  const o = node as Record<string, any>;
  const type = asArray(o["@type"]).map(String);
  if (type.some((t) => /product/i.test(t))) out.push(o);
  if (o["@graph"]) findProducts(o["@graph"], out);
  for (const k of ["mainEntity", "itemOffered"]) if (o[k]) findProducts(o[k], out);
  return out;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.,]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function extractProduct(html: string, pageUrl: string): Extracted {
  const $ = cheerio.load(html);
  const meta = (sel: string) => $(sel).attr("content")?.trim() || "";
  const host = (() => {
    try {
      return new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  // Structured product data, when the shop provides it.
  const products: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      findProducts(JSON.parse($(el).contents().text()), products);
    } catch {
      /* broken JSON on the page; skip it */
    }
  });
  const p = products[0] || {};
  const offers = asArray(p.offers)[0] || {};

  const siteName = meta('meta[property="og:site_name"]');
  let name =
    (typeof p.name === "string" && p.name) ||
    meta('meta[property="og:title"]') ||
    meta('meta[name="twitter:title"]') ||
    $("h1").first().text() ||
    $("title").text() ||
    "";
  name = name.replace(/\s+/g, " ").trim();
  if (siteName) name = name.replace(new RegExp(`\\s*[|\\-–—:]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");

  const price =
    num(offers.price) ??
    num(offers.lowPrice) ??
    num(meta('meta[property="product:price:amount"]')) ??
    num(meta('meta[property="og:price:amount"]')) ??
    num($('[itemprop="price"]').first().attr("content")) ??
    null;
  const currency =
    offers.priceCurrency ||
    meta('meta[property="product:price:currency"]') ||
    meta('meta[property="og:price:currency"]') ||
    $('[itemprop="priceCurrency"]').first().attr("content") ||
    null;

  // Collect candidate photos, best sources first.
  const found: string[] = [];
  const add = (src: string | undefined | null) => {
    const u = abs(src, pageUrl);
    if (u) found.push(u);
  };
  for (const img of asArray(p.image)) add(typeof img === "string" ? img : img?.url || img?.contentUrl);
  $('meta[property="og:image"], meta[property="og:image:secure_url"], meta[property="og:image:url"]').each((_, el) => add($(el).attr("content")));
  add(meta('meta[name="twitter:image"]') || meta('meta[name="twitter:image:src"]'));
  add($('link[rel="image_src"]').attr("href"));
  $("img, source").each((_, el) => {
    const e = $(el);
    const w = parseInt(e.attr("width") || "0", 10);
    const h = parseInt(e.attr("height") || "0", 10);
    if ((w && w < 150) || (h && h < 150)) return;
    const alt = e.attr("alt") || "";
    const src =
      largestFromSrcset(e.attr("srcset") || e.attr("data-srcset")) ||
      e.attr("data-zoom-image") ||
      e.attr("data-large_image") ||
      e.attr("data-src") ||
      e.attr("src");
    if (src && !JUNK.test(src) && !JUNK.test(alt)) add(src);
  });

  const seen = new Set<string>();
  const images: string[] = [];
  for (const u of found) {
    if (/\.(svg|gif)(\?|$)/i.test(u) || JUNK.test(new URL(u).pathname)) continue;
    const k = photoKey(u);
    if (seen.has(k)) continue;
    seen.add(k);
    images.push(u);
    if (images.length >= 24) break;
  }

  return { name: name.slice(0, 200), price, currency: currency ? String(currency).toUpperCase() : null, store: siteName || host, images, url: pageUrl };
}

// Guess a readable name from the link itself, used when the page can't be read.
export function nameFromUrl(u: string): string {
  try {
    const segs = new URL(u).pathname
      .split("/")
      .map((x) => decodeURIComponent(x).replace(/\.(html?|php|aspx?)$/i, ""))
      .filter((x) => /[a-z]/i.test(x) && /[-_ ]/.test(x) && !/^(products?|p|dp|item|items|shop|collections?|en|us|en-us)$/i.test(x));
    if (!segs.length) return "";
    const best = segs.sort((a, b) => b.length - a.length)[0].replace(/[-_]+/g, " ").replace(/\b[a-z0-9]*\d{4,}[a-z0-9]*\b/gi, "").replace(/\s+/g, " ").trim();
    return best ? best[0].toUpperCase() + best.slice(1).toLowerCase() : "";
  } catch {
    return "";
  }
}
