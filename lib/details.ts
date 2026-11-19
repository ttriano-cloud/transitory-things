// Extra facts about a thing, read from the shop's page. Every field is optional.
export type Details = {
  color?: string;
  size?: string;
  description?: string;
  availability?: string; // "In stock", "Sold out", "Preorder"...
  original_price?: number; // the price before a sale
  sku?: string;
  category?: string;
  sizes?: string[]; // the sizes the shop offers
  colors?: string[]; // the colors the shop offers
};

// What the Chrome extension notices on the live page that a copy of it can't show:
// the options you picked and the photo you were looking at.
export type Facts = {
  selected?: Record<string, string>;
  hero?: string;
  price?: string;
};

const clean = (s: unknown, max = 300) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Keeps only known fields with sensible values, so nothing odd ends up stored.
export function tidyDetails(d: Partial<Details> | null | undefined): Details | null {
  if (!d || typeof d !== "object") return null;
  const out: Details = {};
  for (const k of ["color", "size", "availability", "sku", "category"] as const) {
    const v = clean(d[k], 120);
    if (v) out[k] = v;
  }
  const desc = clean(d.description, 1200);
  if (desc) out.description = desc;
  const op = Number(d.original_price);
  if (Number.isFinite(op) && op > 0) out.original_price = Math.round(op * 100) / 100;
  for (const k of ["sizes", "colors"] as const) {
    const list = Array.isArray(d[k]) ? [...new Set(d[k]!.map((x) => clean(x, 40)).filter(Boolean))].slice(0, 30) : [];
    if (list.length) out[k] = list;
  }
  return Object.keys(out).length ? out : null;
}
