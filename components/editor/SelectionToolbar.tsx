"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Bold, Code, Italic, Link2, Sparkles, Strikethrough, Underline, Highlighter } from "lucide-react";
import { useUI } from "@/lib/ui";
import { escapeHtml } from "@/lib/utils";
import type { ID } from "@/lib/types";

const HIGHLIGHTS = ["yellow", "green", "blue", "pink", "red", "purple"];

export function SelectionToolbar({ containerRef, pageId }: { containerRef: RefObject<HTMLDivElement | null>; pageId: ID }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [colors, setColors] = useState(false);
  const [linkMode, setLinkMode] = useState<{ range: Range; url: string } | null>(null);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      const root = containerRef.current;
      if (document.activeElement?.classList.contains("tb-link-input")) return;
      if (!sel || sel.isCollapsed || !root || sel.rangeCount === 0) {
        setPos(null);
        setLinkMode(null);
        setColors(false);
        return;
      }
      const range = sel.getRangeAt(0);
      const anchorEl = (range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement) as HTMLElement | null;
      const rich = anchorEl?.closest?.(".rich");
      if (!rich || !root.contains(rich) || rich.closest(".block-code")) {
        setPos(null);
        return;
      }
      const r = range.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [containerRef]);

  if (!pos) return null;

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
  };

  const wrap = (tag: string, cls?: string) => {
    const text = window.getSelection()?.toString() ?? "";
    if (!text) return;
    const open = cls ? `<${tag} class="${cls}">` : `<${tag}>`;
    exec("insertHTML", `${open}${escapeHtml(text)}</${tag}>&#8203;`);
  };

  return createPortal(
    <div
      className="sel-toolbar"
      style={{ left: Math.max(150, Math.min(pos.x, window.innerWidth - 150)), top: Math.max(8, pos.y - 46) }}
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest(".tb-link")) e.preventDefault();
      }}
    >
      <button
        className="tb-btn ai"
        onClick={() => {
          const text = window.getSelection()?.toString() ?? "";
          useUI.getState().openAI({ pageId, text });
        }}
      >
        <Sparkles size={14} /> IA
      </button>
      <span className="tb-sep" />
      <button className="tb-btn" title="Negrita (Ctrl/⌘+B)" onClick={() => exec("bold")}><Bold size={15} /></button>
      <button className="tb-btn" title="Cursiva (Ctrl/⌘+I)" onClick={() => exec("italic")}><Italic size={15} /></button>
      <button className="tb-btn" title="Subrayado (Ctrl/⌘+U)" onClick={() => exec("underline")}><Underline size={15} /></button>
      <button className="tb-btn" title="Tachado" onClick={() => exec("strikeThrough")}><Strikethrough size={15} /></button>
      <button className="tb-btn" title="Código (Ctrl/⌘+E)" onClick={() => wrap("code")}><Code size={15} /></button>
      <button
        className="tb-btn"
        title="Enlace"
        onClick={() => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) setLinkMode({ range: sel.getRangeAt(0).cloneRange(), url: "https://" });
        }}
      >
        <Link2 size={15} />
      </button>
      <span className="tb-wrap">
        <button className="tb-btn" title="Resaltar" onClick={() => setColors((v) => !v)}><Highlighter size={15} /></button>
        {colors && (
          <span className="tb-colors">
            {HIGHLIGHTS.map((c) => (
              <button key={c} className={`hl-swatch hl-${c}`} aria-label={c} onClick={() => { wrap("mark", `c-${c}`); setColors(false); }} />
            ))}
            <button className="hl-swatch hl-none" aria-label="Quitar formato" onClick={() => { exec("removeFormat"); setColors(false); }}>×</button>
          </span>
        )}
      </span>
      {linkMode && (
        <form
          className="tb-link"
          onMouseDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            const url = linkMode.url.trim();
            if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(linkMode.range);
            exec("createLink", url);
            setLinkMode(null);
          }}
        >
          <input
            id="tb-link-url"
            className="input sm tb-link-input"
            autoFocus
            value={linkMode.url}
            aria-label="URL del enlace"
            onChange={(e) => setLinkMode({ ...linkMode, url: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && setLinkMode(null)}
          />
          <button className="btn primary sm" type="submit">Enlazar</button>
        </form>
      )}
    </div>,
    document.body,
  );
}
