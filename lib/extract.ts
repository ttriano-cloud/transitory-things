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
  for (const k of ["mainEntity", "itemOffered", "hasVariant"]) if (o[k]) findProducts(o[k], out);
  return out;
}

// Reads a price written any common way: "240.00", "$1,299", "1.299,00 €", "77".
export function parsePrice(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Both appear: whichever comes last is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "1,299" is thousands; "12,50" is a decimal.
    s = /,\d{3}$/.test(s) && !/,\d{3},?\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\.(?=\d{3}(\D|$))/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}
const num = parsePrice;

const SYMBOLS: Record<string, string> = { "US$": "USD", "C$": "CAD", "CA$": "CAD", "A$": "AUD", "AU$": "AUD", $: "USD", "£": "GBP", "€": "EUR", "¥": "JPY", "₩": "KRW", "kr": "SEK" };
const MONEY = /(US\$|CA?\$|AU?\$|USD|EUR|GBP|CAD|AUD|JPY|[$£€¥₩])\s?(\d[\d.,\s]*\d|\d)|(\d[\d.,\s]*\d|\d)\s?(€|£|USD|EUR|GBP|kr)/;
const NOT_THE_PRICE = /(compare|was-?price|\bold|original|regular|strike|crossed|before|msrp|list-?price|saving|discount|range|filter|slider|unit-?price|per-?unit|install|klarna|afterpay|affirm|shipping|cart|recommend|related|upsell|recent|wishlist)/i;

function moneyIn(text: string): { price: number; currency: string | null } | null {
  const m = text.replace(/\u00a0/g, " ").match(MONEY);
  if (!m) return null;
  const sym = m[1] || m[4];
  const price = parsePrice(m[2] || m[3]);
  if (price == null) return null;
  return { price, currency: SYMBOLS[sym] || (/^[A-Z]{3}$/.test(sym) ? sym : null) };
}

// Last resort: the price as it's shown on the page.
function visiblePrice($: cheerio.CheerioAPI): { price: number; currency: string | null } | null {
  const sel = '[itemprop="price"], [data-price], [class*="price" i], [id*="price" i], [data-testid*="price" i], [data-test*="price" i]';
  let found: { price: number; currency: string | null } | null = null;
  $(sel).each((_, el) => {
    if (found) return false;
    const e = $(el);
    if (e.closest("del, s, strike, header, footer, nav, aside").length) return;
    let bad = false;
    e.parents().addBack().slice(-4).each((_, a) => {
      const c = `${$(a).attr("class") || ""} ${$(a).attr("id") || ""} ${$(a).attr("data-testid") || ""}`;
      if (NOT_THE_PRICE.test(c)) bad = true;
    });
    if (bad) return;
    // Read the text without any crossed-out or "compare at" prices inside it.
    const c = e.clone();
    c.find("del, s, strike").remove();
    c.find("[class], [id]").each((_, x) => {
      if (NOT_THE_PRICE.test(`${$(x).attr("class") || ""} ${$(x).attr("id") || ""}`)) $(x).remove();
    });
    const text = c.text().replace(/\s+/g, " ").trim();
    if (!text || text.length > 60) return;
    found = moneyIn(text);
  });
  return found;
}

// Bot checks and error pages that some shops show to servers instead of the product.
export function looksBlocked(html: string): boolean {
  const $ = cheerio.load(html);
  if ($('script[type="application/ld+json"]').text().match(/"@type"\s*:\s*"Product"/i)) return false;
  const t = `${$("title").text()} ${$("h1").first().text()}`.toLowerCase();
  return /(just a moment|attention required|access denied|are you a (human|robot)|robot or human|verify (you are|you're) (a )?human|captcha|pardon our interruption|request (was )?blocked|forbidden|security check|bot detection|please enable (js|javascript)|page not found|404)/.test(t);
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
  // Prefer the first product that actually lists a price.
  const offerOf = (prod: any) => {
    for (const o of asArray(prod?.offers)) {
      for (const x of [o, ...asArray(o?.offers)]) {
        const spec = asArray(x?.priceSpecification)[0] || {};
        const price = num(x?.price) ?? num(x?.lowPrice) ?? num(spec.price);
        if (price != null) return { price, priceCurrency: x?.priceCurrency || spec.priceCurrency || null };
      }
    }
    return null;
  };
  const p = products.find((x) => offerOf(x)) || products[0] || {};
  const offers = offerOf(p) || ({} as { price?: number; priceCurrency?: string | null });

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

  let price =
    num(offers.price) ??
    num(meta('meta[property="product:price:amount"]')) ??
    num(meta('meta[property="og:price:amount"]')) ??
    num($('[itemprop="price"]').first().attr("content")) ??
    null;
  let currency: string | null =
    offers.priceCurrency ||
    meta('meta[property="product:price:currency"]') ||
    meta('meta[property="og:price:currency"]') ||
    $('[itemprop="priceCurrency"]').first().attr("content") ||
    null;
  if (price == null) {
    // Twitter cards often carry "$77.00" in a data field labelled Price.
    $('meta[name^="twitter:label"]').each((_, el) => {
      if (price != null || !/price/i.test($(el).attr("content") || "")) return;
      const n = ($(el).attr("name") || "").replace("label", "data");
      const m = moneyIn(meta(`meta[name="${n}"]`));
      if (m) ({ price, currency } = { price: m.price, currency: currency || m.currency });
    });
  }
  if (price == null) {
    const m = visiblePrice($);
    if (m) {
      price = m.price;
      currency = currency || m.currency;
    }
  }

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
