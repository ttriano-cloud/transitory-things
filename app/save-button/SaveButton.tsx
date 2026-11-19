"use client";

import { useEffect, useRef } from "react";

// The bookmark's code. It runs on the shop's page: it copies the page (minus scripts and styles),
// opens a Transitory Things window, and hands the copy over once that window says it's ready.
export function bookmarklet(origin: string) {
  const code = `(()=>{const o=${JSON.stringify(origin)};const I=document.images;const d=document.documentElement.cloneNode(true);d.querySelectorAll('img').forEach((m,i)=>{const r=I[i];if(!r)return;if(r.currentSrc)m.setAttribute('src',r.currentSrc);if(r.naturalWidth)m.setAttribute('width',r.naturalWidth);if(r.naturalHeight)m.setAttribute('height',r.naturalHeight)});d.querySelectorAll('script:not([type*=json]),style,svg,noscript,iframe,template,link:not([rel=image_src]):not([rel=canonical])').forEach(e=>e.remove());let h=d.outerHTML;if(h.length>3e6)h=h.slice(0,3e6);const u=location.href;const w=open(o+'/clip?u='+encodeURIComponent(u),'tt_save','width=560,height=860');const f=e=>{if(e.origin===o&&e.data&&e.data.tt==='ready'&&w){w.postMessage({tt:'page',url:u,html:h},o);removeEventListener('message',f)}};addEventListener('message',f)})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

export default function SaveButton() {
  const ref = useRef<HTMLAnchorElement>(null);
  // React won't render javascript: links, so the bookmark's address is set directly.
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarklet(location.origin));
  }, []);
  return (
    <a ref={ref} className="bm" onClick={(e) => e.preventDefault()} title="Drag me to your bookmarks bar">
      + Transitory Things
    </a>
  );
}
