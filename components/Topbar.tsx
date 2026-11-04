"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CloudOff,
  Copy,
  Download,
  Lock,
  LockOpen,
  Menu,
  MoreHorizontal,
  MoveHorizontal,
  Sparkles,
  Star,
  Trash2,
  Type,
  ChevronsRight,
  Loader2,
} from "lucide-react";
import { getBreadcrumb, pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { pageToMarkdown } from "@/lib/markdown";
import { downloadBlob } from "@/lib/persistence";
import { cx, formatRelative } from "@/lib/utils";
import { anchorFrom, MenuItem, MenuSeparator, MenuTitle, Popover, type Anchor } from "./ui/Popover";

export function SaveIndicator() {
  const saveState = useStore((s) => s.saveState);
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  if (saveState === "saving")
    return (
      <span className="save-ind" aria-live="polite">
        <Loader2 size={13} className="spin" /> Guardando…
      </span>
    );
  if (saveState === "error")
    return (
      <span className="save-ind error" aria-live="polite">
        <CloudOff size={13} /> No se pudo guardar (almacenamiento lleno)
      </span>
    );
  if (saveState === "saved" && lastSavedAt)
    return (
      <span className="save-ind" aria-live="polite" title={new Date(lastSavedAt).toLocaleString("es")}>
        <Check size={13} /> Guardado {formatRelative(lastSavedAt)}
      </span>
    );
  return null;
}

export function Topbar() {
  const ws = useStore((s) => s.ws);
  const pageId = useStore((s) => s.currentPageId);
  const navigate = useStore((s) => s.navigate);
  const updateSettings = useStore((s) => s.updateSettings);
  const ui = useUI();
  const [menu, setMenu] = useState<Anchor | null>(null);
  const page = pageId ? ws.pages[pageId] : undefined;
  const crumbs = page ? getBreadcrumb(ws, page.id) : [];
  const st = useStore.getState;

  return (
    <header className="topbar">
      <button
        className="icon-btn mobile-only"
        aria-label="Abrir menú"
        onClick={() => ui.setMobileSidebar(true)}
      >
        <Menu size={18} />
      </button>
      {!ws.settings.sidebarOpen && (
        <button className="icon-btn desktop-only" aria-label="Mostrar barra lateral" onClick={() => updateSettings({ sidebarOpen: true })}>
          <ChevronsRight size={16} />
        </button>
      )}
      <nav className="crumbs" aria-label="Ruta">
        {crumbs.map((c, i) => (
          <span key={c.id} className="crumb-wrap">
            {i > 0 && <span className="crumb-sep">/</span>}
            <button className={cx("crumb", i === crumbs.length - 1 && "current")} onClick={() => navigate(c.id)}>
              {c.icon && <span>{c.icon}</span>}
              <span className="crumb-text">{pageTitle(c)}</span>
            </button>
          </span>
        ))}
      </nav>
      <div className="topbar-right">
        <SaveIndicator />
        {page?.locked && <Lock size={14} className="muted" />}
        {page && (
          <>
            <button className="icon-btn" aria-label="Asistente IA" title="Asistente IA (Ctrl/⌘ + J)" onClick={() => ui.openAI({ pageId: page.id })}>
              <Sparkles size={16} />
            </button>
            <button className={cx("icon-btn", page.favorite && "fav-on")} aria-label="Favorito" onClick={() => st().toggleFavorite(page.id)}>
              <Star size={16} fill={page.favorite ? "currentColor" : "none"} />
            </button>
            <button className="icon-btn" aria-label="Opciones de la página" onClick={(e) => setMenu(anchorFrom(e.currentTarget))}>
              <MoreHorizontal size={18} />
            </button>
          </>
        )}
      </div>

      {menu && page && (
        <Popover anchor={{ ...menu, x: menu.x - 200 }} onClose={() => setMenu(null)} width={250}>
          <MenuTitle>Estilo</MenuTitle>
          <div className="font-picker">
            {(["sans", "serif", "mono"] as const).map((f) => (
              <button key={f} className={cx("font-opt", `font-${f}`, (page.font ?? "sans") === f && "on")} onClick={() => st().updatePage(page.id, { font: f })}>
                <span>Ag</span>
                <small>{f === "sans" ? "Sans" : f === "serif" ? "Serif" : "Mono"}</small>
              </button>
            ))}
          </div>
          <MenuItem icon={<Type size={15} />} label="Texto pequeño" active={page.smallText} onClick={() => st().updatePage(page.id, { smallText: !page.smallText })} />
          <MenuItem icon={<MoveHorizontal size={15} />} label="Ancho completo" active={page.fullWidth} onClick={() => st().updatePage(page.id, { fullWidth: !page.fullWidth })} />
          <MenuItem
            icon={page.locked ? <LockOpen size={15} /> : <Lock size={15} />}
            label={page.locked ? "Desbloquear página" : "Bloquear página"}
            onClick={() => st().updatePage(page.id, { locked: !page.locked })}
          />
          <MenuSeparator />
          <MenuItem
            icon={<Copy size={15} />}
            label="Duplicar"
            onClick={() => {
              const id = st().duplicatePage(page.id);
              setMenu(null);
              if (id) navigate(id);
            }}
          />
          <MenuItem
            icon={<Download size={15} />}
            label="Exportar a Markdown"
            onClick={() => {
              downloadBlob(new Blob([pageToMarkdown(ws, page)], { type: "text/markdown" }), `${(page.title || "pagina").replace(/[^\w\-áéíóúñ ]/gi, "")}.md`);
              setMenu(null);
            }}
          />
          <MenuSeparator />
          <MenuItem
            danger
            icon={<Trash2 size={15} />}
            label="Mover a la papelera"
            onClick={() => {
              st().trashPage(page.id);
              ui.showToast("Página movida a la papelera");
              setMenu(null);
            }}
          />
          <div className="menu-foot muted small">
            Creada {formatRelative(page.createdAt)} · {page.blocks.length} bloques
          </div>
        </Popover>
      )}
    </header>
  );
}
