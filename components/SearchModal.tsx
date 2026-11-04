"use client";

import { useMemo, useState } from "react";
import { FileText, Moon, Plus, Search, Settings, Sparkles, LayoutTemplate, Trash2, Database as DbIcon } from "lucide-react";
import { getBreadcrumb, pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { stripTags, cx, formatRelative } from "@/lib/utils";
import type { Page } from "@/lib/types";
import { Modal } from "./ui/Popover";

interface Hit {
  page: Page;
  score: number;
  snippet?: string;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function SearchModal() {
  const ws = useStore((s) => s.ws);
  const navigate = useStore((s) => s.navigate);
  const ui = useUI();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const commands = useMemo(
    () => [
      { id: "new", label: "Nueva página", icon: <Plus size={15} />, run: () => navigate(useStore.getState().createPage({})) },
      { id: "tpl", label: "Abrir plantillas", icon: <LayoutTemplate size={15} />, run: () => ui.openTemplates(null) },
      { id: "ai", label: "Preguntar a la IA", icon: <Sparkles size={15} />, run: () => ui.openAI({ pageId: useStore.getState().currentPageId, text: q }) },
      {
        id: "theme",
        label: "Cambiar modo claro/oscuro",
        icon: <Moon size={15} />,
        run: () => {
          const s = useStore.getState();
          const dark = document.documentElement.dataset.theme === "dark";
          s.updateSettings({ theme: dark ? "light" : "dark" });
        },
      },
      { id: "settings", label: "Ajustes", icon: <Settings size={15} />, run: () => ui.openSettings() },
      { id: "trash", label: "Papelera", icon: <Trash2 size={15} />, run: () => ui.openTrash() },
    ],
    [navigate, ui, q],
  );

  const hits = useMemo<Hit[]>(() => {
    const query = norm(q.trim());
    const pages = Object.values(ws.pages).filter((p) => !p.trashed);
    if (!query) {
      return pages.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).map((page) => ({ page, score: 0 }));
    }
    const words = query.split(/\s+/);
    const out: Hit[] = [];
    for (const page of pages) {
      const title = norm(pageTitle(page));
      let score = 0;
      let snippet: string | undefined;
      if (words.every((w) => title.includes(w))) score += title.startsWith(words[0]) ? 100 : 60;
      for (const b of page.blocks) {
        const text = stripTags(b.html);
        const t = norm(text);
        if (words.every((w) => t.includes(w))) {
          score += 10;
          if (!snippet) {
            const at = t.indexOf(words[0]);
            snippet = (at > 30 ? "…" : "") + text.slice(Math.max(0, at - 30), at + 80);
          }
        }
      }
      if (page.props) {
        const vals = norm(Object.values(page.props).filter((v) => typeof v === "string" || typeof v === "number").join(" "));
        if (words.every((w) => vals.includes(w))) score += 5;
      }
      if (score) out.push({ page, score, snippet });
    }
    return out.sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt).slice(0, 30);
  }, [ws.pages, q]);

  const cmdHits = commands.filter((c) => !q.trim() || norm(c.label).includes(norm(q.trim())));
  const total = hits.length + cmdHits.length;

  const choose = (i: number) => {
    ui.openSearch(false);
    if (i < hits.length) {
      const p = hits[i].page;
      if (p.dbId) {
        navigate(p.dbId);
        useStore.getState().setPeek(p.id);
      } else navigate(p.id);
    } else cmdHits[i - hits.length]?.run();
  };

  const highlight = (text: string) => {
    const words = q.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return text;
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  };

  return (
    <Modal onClose={() => ui.openSearch(false)} width={640} className="search-modal">
      <div className="search-input">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Busca páginas, contenido o comandos…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, total - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            if (e.key === "Enter") { e.preventDefault(); choose(idx); }
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="search-results">
        {hits.length > 0 && <div className="menu-title">{q.trim() ? "Resultados" : "Recientes"}</div>}
        {hits.map((h, i) => {
          const crumb = getBreadcrumb(ws, h.page.id).slice(0, -1).map(pageTitle).join(" / ");
          return (
            <button key={h.page.id} className={cx("search-hit", i === idx && "active")} onMouseEnter={() => setIdx(i)} onClick={() => choose(i)}>
              <span className="search-icon">{h.page.icon || (h.page.database ? <DbIcon size={16} /> : <FileText size={16} />)}</span>
              <span className="search-text">
                <span className="search-title">{highlight(pageTitle(h.page))}</span>
                {h.snippet && <span className="search-snippet">{highlight(h.snippet)}</span>}
                {crumb && <span className="search-crumb">{crumb}</span>}
              </span>
              <span className="muted small">{formatRelative(h.page.updatedAt)}</span>
            </button>
          );
        })}
        {q.trim() && hits.length === 0 && <div className="menu-empty">No se encontraron páginas con «{q}».</div>}
        {cmdHits.length > 0 && <div className="menu-title">Comandos</div>}
        {cmdHits.map((c, j) => {
          const i = hits.length + j;
          return (
            <button key={c.id} className={cx("search-hit", i === idx && "active")} onMouseEnter={() => setIdx(i)} onClick={() => choose(i)}>
              <span className="search-icon">{c.icon}</span>
              <span className="search-title">{c.label}</span>
            </button>
          );
        })}
      </div>
      <div className="search-foot muted small">
        <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
        <span><kbd>↵</kbd> abrir</span>
      </div>
    </Modal>
  );
}
