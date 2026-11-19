// Transitory Things: click the toolbar button on a product page to save it.
// It copies the page you're looking at (without scripts and styles), notes the options you
// picked and the photo on screen, opens a small Transitory Things window, and hands it all
// to that window to fill in the form.

const SITE = "https://transitorythings.com";

// Runs inside the shop's page.
function copyPage() {
  const imgs = document.images;
  const d = document.documentElement.cloneNode(true);
  d.querySelectorAll("img").forEach((m, i) => {
    const r = imgs[i];
    if (!r) return;
    if (r.currentSrc) m.setAttribute("src", r.currentSrc);
    if (r.naturalWidth) m.setAttribute("width", r.naturalWidth);
    if (r.naturalHeight) m.setAttribute("height", r.naturalHeight);
  });
  d.querySelectorAll("script:not([type*=json]),style,svg,noscript,iframe,template,link:not([rel=image_src]):not([rel=canonical])").forEach((e) => e.remove());
  let html = d.outerHTML;
  if (html.length > 3e6) html = html.slice(0, 3e6);
  return { url: location.href, html, facts: noticeFacts() };

  // What a copy of the page can't show: the options picked, the photo on screen, the price shown.
  function noticeFacts() {
    const facts = { selected: {} };
    const OPTION = /size|taille|gr\u00f6\u00dfe|colou?r|shade|finish|option/i;
    const say = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const groupName = (el) => {
      const g = el.closest("fieldset, [role=radiogroup], [data-option-name], [class*=option], [class*=swatch], [class*=variant]");
      return say([el.name, el.getAttribute("data-option-name"), g?.getAttribute("data-option-name"), g?.getAttribute("aria-label"), g?.querySelector("legend")?.textContent, g?.className].filter(Boolean).join(" "));
    };
    const keep = (key, value) => {
      if (!OPTION.test(key)) return;
      // "options[Size]" is a size, not just an option.
      const k = /size|taille|gr\u00f6\u00dfe/i.test(key) ? "size" : /colou?r|shade|finish/i.test(key) ? "color" : "option";
      value = say(value);
      if (value && value.length < 40 && !facts.selected[k]) facts.selected[k] = value;
    };
    try {
      document.querySelectorAll("input[type=radio]:checked").forEach((el) => {
        const label = el.labels?.[0]?.textContent || el.getAttribute("aria-label") || el.value;
        keep(groupName(el), label);
      });
      document.querySelectorAll("select").forEach((el) => {
        const o = el.options[el.selectedIndex];
        if (o && o.value !== "") keep(say(`${el.name} ${el.id} ${el.getAttribute("aria-label") || ""}`), o.textContent);
      });
      document.querySelectorAll("[role=radio][aria-checked=true], [aria-pressed=true], [aria-selected=true]").forEach((el) => {
        keep(groupName(el), el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent);
      });
    } catch {}

    // The photo taking up the most of the screen.
    let best = 0;
    for (const im of document.images) {
      const r = im.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      const src = im.currentSrc || im.src;
      if (w * h > best && im.naturalWidth >= 300 && /^https:/.test(src)) {
        best = w * h;
        facts.hero = src;
      }
    }

    // The price as it's shown, near the top of the page and not crossed out.
    for (const el of document.querySelectorAll('[itemprop=price], [class*=price i], [data-testid*=price i]')) {
      if (el.closest("del, s, strike, header, footer, nav, aside, [class*=compare i], [class*=was i]")) continue;
      const r = el.getBoundingClientRect();
      const t = say(el.textContent);
      if (r.width && r.top < innerHeight * 1.5 && t.length < 30 && /\d/.test(t)) {
        facts.price = t;
        break;
      }
    }
    return facts;
  }
}

// Runs inside the Transitory Things window: waits for it to say it's ready, then hands over the page.
function handOver(page) {
  const onMessage = (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.tt !== "ready") return;
    window.removeEventListener("message", onMessage);
    window.postMessage({ tt: "page", ext: true, url: page.url, html: page.html, facts: page.facts || {} }, location.origin);
  };
  window.addEventListener("message", onMessage);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url || "")) return;
  if ((tab.url || "").startsWith(SITE)) return;

  let page = { url: tab.url, html: "" };
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: copyPage });
    if (res?.result) page = res.result;
  } catch {
    // Some pages (the Chrome Web Store, browser pages) can't be read; the window falls back to the link.
  }

  const win = await chrome.windows.create({
    url: `${SITE}/clip?ext=1&u=${encodeURIComponent(page.url)}`,
    type: "popup",
    width: 560,
    height: 860,
  });
  const clipTab = win.tabs?.[0]?.id;
  if (!clipTab || !page.html) return;

  // Hand the copy over as soon as the window has started loading.
  const inject = async () => {
    try {
      await chrome.scripting.executeScript({ target: { tabId: clipTab }, func: handOver, args: [page] });
      return true;
    } catch {
      return false;
    }
  };
  const listener = async (id, info) => {
    if (id !== clipTab || info.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(listener);
    await inject();
  };
  chrome.tabs.onUpdated.addListener(listener);
});
