import { test } from "node:test";
import assert from "node:assert/strict";
import { extractProduct, nameFromUrl } from "../lib/extract.ts";

const shopify = `<!doctype html><html><head>
<title>Waxed Wool Overshirt – Field Goods</title>
<meta property="og:site_name" content="Field Goods">
<meta property="og:title" content="Waxed Wool Overshirt – Field Goods">
<meta property="og:image" content="//cdn.shop.com/files/shirt_1200x.jpg?v=1">
<meta property="product:price:amount" content="240.00">
<meta property="product:price:currency" content="usd">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Waxed Wool Overshirt","image":["https://cdn.shop.com/files/shirt.jpg","https://cdn.shop.com/files/shirt-back.jpg"],"offers":{"@type":"Offer","price":"240.00","priceCurrency":"USD"}}]}</script>
</head><body>
<img src="/logo.svg" alt="Field Goods logo">
<img src="https://cdn.shop.com/files/shirt_400x.jpg" width="400">
<img srcset="https://cdn.shop.com/files/detail_300x.jpg 300w, https://cdn.shop.com/files/detail_1600x.jpg 1600w">
<img src="https://cdn.shop.com/icons/visa.png" width="40" height="24">
</body></html>`;

test("reads name, price, store, and photos from a typical shop page", () => {
  const r = extractProduct(shopify, "https://fieldgoods.co/products/waxed-wool-overshirt");
  assert.equal(r.name, "Waxed Wool Overshirt");
  assert.equal(r.price, 240);
  assert.equal(r.currency, "USD");
  assert.equal(r.store, "Field Goods");
  assert.equal(r.images[0], "https://cdn.shop.com/files/shirt.jpg");
  assert.ok(r.images.includes("https://cdn.shop.com/files/shirt-back.jpg"));
  assert.ok(r.images.includes("https://cdn.shop.com/files/detail_1600x.jpg"));
  assert.ok(!r.images.some((u) => /logo|visa/.test(u)), "logos and payment icons are skipped");
  assert.equal(r.images.filter((u) => /files\/shirt(_\d+x)?\.jpg/.test(u)).length, 1, "same photo at different sizes shows once");
});

test("falls back to Open Graph and the page title", () => {
  const html = `<html><head><title>Brass Lamp | Lumen</title><meta property="og:image" content="/img/lamp.jpg"></head><body></body></html>`;
  const r = extractProduct(html, "https://www.lumenhouse.com/lamp");
  assert.equal(r.name, "Brass Lamp | Lumen");
  assert.equal(r.store, "lumenhouse.com");
  assert.deepEqual(r.images, ["https://www.lumenhouse.com/img/lamp.jpg"]);
  assert.equal(r.price, null);
});

test("guesses a name from the link when the page can't be read", () => {
  assert.equal(nameFromUrl("https://www.ssense.com/en-us/men/product/our-legacy/black-wool-overshirt/16012341"), "Black wool overshirt");
  assert.equal(nameFromUrl("https://www.zara.com/us/en/textured-knit-sweater-p03920355.html"), "Textured knit sweater");
});
