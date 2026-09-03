"use client";

import { useState } from "react";
import { DESIGN_STYLES, type DesignStyle, useTheme } from "@/components/theme-provider";

export default function DesignStyleSwitcher() {
  const { designStyle, setDesignStyle } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="design-style-trigger"
        aria-expanded={open}
        aria-label="Change visual style"
      >
        <span className="design-style-trigger-dot" />
        <span className="hidden xl:inline">{DESIGN_STYLES.find((s) => s.id === designStyle)?.name}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="design-style-menu" role="menu">
          {DESIGN_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              role="menuitemradio"
              aria-checked={designStyle === style.id}
              onClick={() => {
                setDesignStyle(style.id as DesignStyle);
                setOpen(false);
              }}
              className={`design-style-option ${designStyle === style.id ? "is-active" : ""}`}
            >
              <span className={`design-style-swatch style-${style.id}`}>
                <i /><i /><i />
              </span>
              <span className="min-w-0 text-left">
                <strong>{style.name}</strong>
                <small>{style.description}</small>
              </span>
              {designStyle === style.id && <span className="design-style-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
