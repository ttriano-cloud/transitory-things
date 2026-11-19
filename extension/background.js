// Transitory Things: click the toolbar button on a product page to save it.
// It copies the page you're looking at (without scripts and styles), opens a small
// Transitory Things window, and hands the copy to that window to fill in the form.

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
  return { url: location.href, html };
}

// Runs inside the Transitory Things window: waits for it to say it's ready, then hands over the page.
function handOver(page) {
  const onMessage = (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.tt !== "ready") return;
    window.removeEventListener("message", onMessage);
    window.postMessage({ tt: "page", ext: true, url: page.url, html: page.html }, location.origin);
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
