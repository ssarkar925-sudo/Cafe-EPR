"use client";

import { useEffect, useState } from "react";

const STYLES = [
  ["ambient-swiss","01 · Ambient Swiss","Warm editorial canvas with precise colour hierarchy"],
  ["soft-fintech","02 · Soft Fintech","Clean finance language with muted green and lavender surfaces"],
  ["color-block-luxury","03 · Colour-Block Luxury","Large restrained colour blocks with premium typography"],
  ["bento-editorial","04 · Bento Editorial","Asymmetric bento composition with stronger editorial hierarchy"],
  ["warm-paper","05 · Warm Paper","Soft paper neutrals with rose, olive and ochre accents"],
  ["soft-glass","06 · Soft Glass","Solid surfaces with selective translucent floating controls"],
  ["dark-anchor","07 · Dark Anchor","Light-first canvas punctuated by rich dark analytics anchors"],
  ["muted-rainbow","08 · Muted Rainbow","Grown-up plum, blue, sage, terracotta and ochre palette"],
  ["quiet-luxury","09 · Quiet Luxury","Low chrome, sharp spacing and elegant monochrome hierarchy"],
  ["premium-hybrid","10 · Premium Hybrid","Ambient Swiss + muted rainbow + dark anchors + editorial bento"],
] as const;
const KEY = "cafe-erp-design-style-v2";

export default function DesignStyleSwitcher() {
  const [style, setStyle] = useState("premium-hybrid");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    const next = STYLES.some(([id]) => id === saved) ? saved! : "premium-hybrid";
    setStyle(next);
    document.documentElement.setAttribute("data-design-style-v2", next);
  }, []);
  function choose(next: string) {
    setStyle(next);
    try { localStorage.setItem(KEY, next); } catch {}
    document.documentElement.setAttribute("data-design-style-v2", next);
    setOpen(false);
  }
  const active = STYLES.find(([id]) => id === style) ?? STYLES[9];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="design-style-trigger" aria-expanded={open} aria-label="Change visual style">
        <span className="design-style-trigger-dot" />
        <span className="hidden xl:inline">{active[1]}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="design-style-menu" role="menu">
          {STYLES.map(([id,name,description]) => (
            <button key={id} type="button" role="menuitemradio" aria-checked={style === id} onClick={() => choose(id)} className={`design-style-option ${style === id ? "is-active" : ""}`}>
              <span className={`design-style-swatch style-${id}`}><i/><i/><i/></span>
              <span className="min-w-0 text-left"><strong>{name}</strong><small>{description}</small></span>
              {style === id && <span className="design-style-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
