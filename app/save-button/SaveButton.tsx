"use client";

import { useEffect, useRef } from "react";

// The bookmark's code. It runs on the shop's page: it copies the page (minus scripts and styles),
// notes the page's full-size gallery photos (Amazon keeps them in script data), opens a
// Transitory Things window, and hands it all over once that window says it's ready.
export function bookmarklet(origin: string) {
  const code = `(()=>{const o=${JSON.stringify(origin)};const I=document.images;const d=document.documentElement.cloneNode(true);d.querySelectorAll('img').forEach((m,i)=>{const r=I[i];if(!r)return;if(r.currentSrc)m.setAttribute('src',r.currentSrc);if(r.naturalWidth)m.setAttribute('width',r.naturalWidth);if(r.naturalHeight)m.setAttribute('height',r.naturalHeight)});d.querySelectorAll('script:not([type*=json]),style,svg,noscript,iframe,template,link:not([rel=image_src]):not([rel=canonical])').forEach(e=>e.remove());let h=d.outerHTML;if(h.length>3e6)h=h.slice(0,3e6);const u=location.href;const g=[];const a=x=>{if(typeof x==='string'&&/^https:/.test(x)&&x.length<2e3&&!g.includes(x)&&g.length<40)g.push(x)};try{document.querySelectorAll('img[data-old-hires],img[data-a-dynamic-image]').forEach(m=>{a(m.getAttribute('data-old-hires'));try{const j=JSON.parse(m.getAttribute('data-a-dynamic-image')||'{}');a(Object.keys(j).sort((x,y)=>(j[y][0]||0)-(j[x][0]||0))[0])}catch(e){}});for(const s of document.scripts){const t=s.src?'':s.textContent||'';if(t.length>2e6||!t.includes('hiRes'))continue;for(const m of t.matchAll(/"hiRes"\\s*:\\s*"(https:[^"]+)"/g))a(m[1].replace(/\\\\\\//g,'/'))}}catch(e){}const w=open(o+'/clip?u='+encodeURIComponent(u),'tt_save','width=560,height=860');const f=e=>{if(e.origin===o&&e.data&&e.data.tt==='ready'&&w){w.postMessage({tt:'page',url:u,html:h,facts:{images:g}},o);removeEventListener('message',f)}};addEventListener('message',f)})()`;
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
