"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  FileText,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  ChevronsLeft,
  ArrowUpToLine,
  Pencil,
  Database as DbIcon,
} from "lucide-react";
import { getChildren, pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import type { ID, Page } from "@/lib/types";
import { cx } from "@/lib/utils";
import { anchorFrom, MenuItem, MenuSeparator, Popover, type Anchor } from "./ui/Popover";

const EXP_KEY = "booksx:sidebar:expanded";

function loadExpanded(): Record<ID, boolean> {
  try {
    return JSON.parse(localStorage.getItem(EXP_KEY) || "{}");
  } catch {
    return {};
  }
}

export function Sidebar() {
  const ws = useStore((s) => s.ws);
  const currentPageId = useStore((s) => s.currentPageId);
  const navigate = useStore((s) => s.navigate);
  const createPage = useStore((s) => s.createPage);
  const updateSettings = useStore((s) => s.updateSettings);
  const ui = useUI();
  const [expanded, setExpanded] = useState<Record<ID, boolean>>({});
  const [menu, setMenu] = useState<{ id: ID; anchor: Anchor } | null>(null);
  const [renaming, setRenaming] = useState<ID | null>(null);
  const [drag, setDrag] = useState<{ id: ID } | null>(null);
  const [dropHint, setDropHint] = useState<{ id: ID; pos: "before" | "inside" | "after" } | null>(null);
  const resizing = useRef(false);

  useEffect(() => setExpanded(loadExpanded()), []);

  const toggle = useCallback((id: ID, v?: boolean) => {
    setExpanded((e) => {
      const next = { ...e, [id]: v ?? !e[id] };
      try {
        localStorage.setItem(EXP_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // expand ancestors of current page
  useEffect(() => {
    if (!currentPageId) return;
    let p = ws.pages[currentPageId];
    const ids: ID[] = [];
    while (p?.parentId) {
      ids.push(p.parentId);
      p = ws.pages[p.parentId];
    }
    if (ids.some((id) => !expanded[id])) ids.forEach((id) => toggle(id, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageId]);

  const go = (id: ID) => {
    navigate(id);
    ui.setMobileSidebar(false);
  };

  const newPage = (parentId: ID | null = null) => {
    const id = createPage({ parentId });
    if (parentId) toggle(parentId, true);
    go(id);
  };

  // ---------- resize
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!resizing.current) return;
      const w = Math.max(200, Math.min(480, e.clientX));
      document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    };
    const up = (e: MouseEvent) => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.classList.remove("resizing");
      updateSettings({ sidebarWidth: Math.max(200, Math.min(480, e.clientX)) });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [updateSettings]);

  const favorites = Object.values(ws.pages).filter((p) => p.favorite && !p.trashed);
  const roots = getChildren(ws, null);

  const onDrop = () => {
    if (!drag || !dropHint || drag.id === dropHint.id) return;
    const s = useStore.getState();
    const target = ws.pages[dropHint.id];
    if (!target) return;
    if (dropHint.pos === "inside") {
      s.movePage(drag.id, target.id);
      toggle(target.id, true);
    } else {
      const parentId = target.parentId;
      const siblings = (parentId ? ws.childOrder[parentId] ?? [] : ws.rootOrder).filter((x) => x !== drag.id);
      let idx = siblings.indexOf(target.id);
      if (dropHint.pos === "after") idx += 1;
      s.movePage(drag.id, parentId, idx);
    }
    setDrag(null);
    setDropHint(null);
  };

  const renderItem = (page: Page, depth: number, keyPrefix = "") => {
    const kids = getChildren(ws, page.id);
    const isOpen = !!expanded[page.id];
    const active = currentPageId === page.id;
    return (
      <div key={keyPrefix + page.id}>
        <div
          className={cx(
            "side-item",
            active && "active",
            dropHint?.id === page.id && `drop-${dropHint.pos}`,
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable={!keyPrefix && renaming !== page.id}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", page.id);
            setDrag({ id: page.id });
          }}
          onDragEnd={() => {
            setDrag(null);
            setDropHint(null);
          }}
          onDragOver={(e) => {
            if (!drag || keyPrefix) return;
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = e.clientY - r.top;
            const pos = y < r.height * 0.28 ? "before" : y > r.height * 0.72 ? "after" : "inside";
            setDropHint({ id: page.id, pos });
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDrop();
          }}
          onClick={() => go(page.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ id: page.id, anchor: { x: e.clientX, y: e.clientY } });
          }}
        >
          <button
            className={cx("side-toggle", isOpen && "open")}
            aria-label={isOpen ? "Contraer" : "Expandir"}
            onClick={(e) => {
              e.stopPropagation();
              toggle(page.id);
            }}
          >
            <ChevronRight size={14} />
          </button>
          <span className="side-icon">
            {page.icon || (page.database ? <DbIcon size={15} /> : <FileText size={15} />)}
          </span>
          {renaming === page.id ? (
            <input
              className="side-rename"
              autoFocus
              defaultValue={page.title}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                useStore.getState().updatePage(page.id, { title: e.target.value });
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <span className="side-title">{pageTitle(page)}</span>
          )}
          <span className="side-actions">
            <button
              className="icon-btn xs"
              aria-label="Más acciones"
              onClick={(e) => {
                e.stopPropagation();
                setMenu({ id: page.id, anchor: anchorFrom(e.currentTarget) });
              }}
            >
              <MoreHorizontal size={14} />
            </button>
            {!page.database && (
              <button
                className="icon-btn xs"
                aria-label="Añadir subpágina"
                onClick={(e) => {
                  e.stopPropagation();
                  newPage(page.id);
                }}
              >
                <Plus size={14} />
              </button>
            )}
          </span>
        </div>
        {isOpen && (
          <div>
            {kids.length === 0 ? (
              <div className="side-empty" style={{ paddingLeft: 30 + depth * 14 }}>
                {page.database ? "Sin subpáginas" : "Sin páginas dentro"}
              </div>
            ) : (
              kids.map((k) => renderItem(k, depth + 1, keyPrefix))
            )}
          </div>
        )}
      </div>
    );
  };

  const menuPage = menu ? ws.pages[menu.id] : null;

  return (
    <>
      <div className={cx("sidebar-backdrop", ui.mobileSidebar && "show")} onClick={() => ui.setMobileSidebar(false)} />
      <aside
        className={cx("sidebar", !ws.settings.sidebarOpen && "collapsed", ui.mobileSidebar && "mobile-open")}
        aria-label="Barra lateral"
      >
        <div className="side-header">
          <div className="ws-switch">
            <span className="ws-avatar">{(ws.name || "B").trim()[0]?.toUpperCase()}</span>
            <span className="ws-name">{ws.name}</span>
          </div>
          <button
            className="icon-btn"
            aria-label="Ocultar barra lateral"
            title="Ocultar (Ctrl/⌘ + \)"
            onClick={() => {
              if (window.innerWidth < 768) ui.setMobileSidebar(false);
              else updateSettings({ sidebarOpen: false });
            }}
          >
            <ChevronsLeft size={16} />
          </button>
        </div>

        <nav className="side-nav">
          <button className="side-link" onClick={() => ui.openSearch()}>
            <Search size={16} /> <span>Buscar</span> <kbd>⌘K</kbd>
          </button>
          <button className="side-link" onClick={() => ui.openAI({ pageId: currentPageId })}>
            <Sparkles size={16} /> <span>Asistente IA</span> <kbd>⌘J</kbd>
          </button>
          <button className="side-link" onClick={() => ui.openSettings()}>
            <Settings size={16} /> <span>Ajustes</span>
          </button>
          <button className="side-link" onClick={() => newPage(null)}>
            <Plus size={16} /> <span>Nueva página</span>
          </button>
        </nav>

        <div className="side-scroll">
          {favorites.length > 0 && (
            <section className="side-section">
              <div className="side-section-title">Favoritos</div>
              {favorites.map((p) => renderItem(p, 0, "fav-"))}
            </section>
          )}
          <section
            className="side-section"
            onDragOver={(e) => drag && e.preventDefault()}
          >
            <div className="side-section-title">
              Páginas
              <button className="icon-btn xs" aria-label="Nueva página" onClick={() => newPage(null)}>
                <Plus size={14} />
              </button>
            </div>
            {roots.map((p) => renderItem(p, 0))}
            {roots.length === 0 && <div className="side-empty">Crea tu primera página</div>}
          </section>
        </div>

        <div className="side-footer">
          <button className="side-link" onClick={() => ui.openTemplates(null)}>
            <LayoutTemplate size={16} /> <span>Plantillas</span>
          </button>
          <button className="side-link" onClick={() => ui.openTrash()}>
            <Trash2 size={16} /> <span>Papelera</span>
          </button>
        </div>
        <div
          className="side-resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            resizing.current = true;
            document.body.classList.add("resizing");
          }}
          onDoubleClick={() => {
            document.documentElement.style.setProperty("--sidebar-w", "260px");
            updateSettings({ sidebarWidth: 260 });
          }}
        />
      </aside>

      {menu && menuPage && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={230}>
          <MenuItem
            icon={menuPage.favorite ? <StarOff size={15} /> : <Star size={15} />}
            label={menuPage.favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
            onClick={() => {
              useStore.getState().toggleFavorite(menu.id);
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Pencil size={15} />}
            label="Renombrar"
            onClick={() => {
              setRenaming(menu.id);
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Copy size={15} />}
            label="Duplicar"
            onClick={() => {
              const id = useStore.getState().duplicatePage(menu.id);
              setMenu(null);
              if (id) go(id);
            }}
          />
          {menuPage.parentId && (
            <MenuItem
              icon={<ArrowUpToLine size={15} />}
              label="Mover a la raíz"
              onClick={() => {
                useStore.getState().movePage(menu.id, null);
                setMenu(null);
              }}
            />
          )}
          {!menuPage.database && (
            <MenuItem
              icon={<LayoutTemplate size={15} />}
              label="Añadir desde plantilla"
              onClick={() => {
                ui.openTemplates(menu.id);
                setMenu(null);
              }}
            />
          )}
          <MenuSeparator />
          <MenuItem
            danger
            icon={<Trash2 size={15} />}
            label="Mover a la papelera"
            onClick={() => {
              useStore.getState().trashPage(menu.id);
              ui.showToast("Página movida a la papelera");
              setMenu(null);
            }}
          />
        </Popover>
      )}
    </>
  );
}
