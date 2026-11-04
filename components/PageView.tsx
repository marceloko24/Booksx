"use client";

import { useState } from "react";
import { ImagePlus, Smile, Plus, Sparkles, LayoutTemplate } from "lucide-react";
import type { ID } from "@/lib/types";
import { pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { propIcon } from "@/lib/query";
import { cx, formatRelative } from "@/lib/utils";
import { Editor } from "./editor/Editor";
import { DatabaseView } from "./database/DatabaseView";
import { Cell } from "./database/TableView";
import { PropertyMenu } from "./database/PropertyMenu";
import { COVERS, EmojiPicker } from "./ui/EmojiPicker";
import { anchorFrom, Popover, type Anchor } from "./ui/Popover";

export function PageBody({ pageId, peek = false }: { pageId: ID; peek?: boolean }) {
  const page = useStore((s) => s.ws.pages[pageId]);
  const updatePage = useStore((s) => s.updatePage);
  const [emoji, setEmoji] = useState<Anchor | null>(null);
  const [cover, setCover] = useState<Anchor | null>(null);
  if (!page) return <div className="empty-state">Esta página no existe.</div>;

  const isDb = !!page.database;
  const locked = !!page.locked;
  const isBlankPage = !isDb && !page.dbId && page.blocks.length === 1 && !page.blocks[0].html && page.blocks[0].type === "paragraph";

  return (
    <div className={cx("page", page.fullWidth || isDb ? "full" : "", page.smallText && "small-text", `font-${page.font ?? "sans"}`, peek && "peek-page")}>
      {page.cover && (
        <div className="cover" style={{ background: page.cover }}>
          {!locked && (
            <div className="cover-actions">
              <button className="btn sm glass" onClick={(e) => setCover(anchorFrom(e.currentTarget))}>Cambiar portada</button>
              <button className="btn sm glass" onClick={() => updatePage(pageId, { cover: undefined })}>Quitar</button>
            </div>
          )}
        </div>
      )}
      <div className="page-inner">
        <div className={cx("page-head", page.cover && "has-cover", page.icon && "has-icon")}>
          {page.icon && (
            <button className="page-icon" onClick={(e) => !locked && setEmoji(anchorFrom(e.currentTarget))} aria-label="Cambiar icono">
              {page.icon}
            </button>
          )}
          {!locked && (
            <div className="page-head-actions">
              {!page.icon && (
                <button className="btn ghost sm" onClick={(e) => setEmoji(anchorFrom(e.currentTarget))}>
                  <Smile size={14} /> Añadir icono
                </button>
              )}
              {!page.cover && (
                <button className="btn ghost sm" onClick={() => updatePage(pageId, { cover: COVERS[Math.floor(Math.random() * COVERS.length)] })}>
                  <ImagePlus size={14} /> Añadir portada
                </button>
              )}
            </div>
          )}
          <textarea
            className="page-title"
            rows={1}
            placeholder={isDb ? "Base de datos sin título" : "Sin título"}
            value={page.title}
            readOnly={locked}
            onChange={(e) => updatePage(pageId, { title: e.target.value.replace(/\n/g, "") })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const first = document.querySelector<HTMLElement>(`${peek ? ".peek" : ".main"} .editor .rich`);
                first?.focus();
              }
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
          />
          <div className="page-meta muted small">Editado {formatRelative(page.updatedAt)}</div>
        </div>

        {page.dbId && <RowProperties rowId={pageId} />}

        {isDb ? (
          <DatabaseView dbId={pageId} />
        ) : (
          <>
            <Editor pageId={pageId} readOnly={locked} />
            {isBlankPage && !locked && <EmptyPageHints pageId={pageId} />}
          </>
        )}
      </div>

      {emoji && <EmojiPicker anchor={emoji} onClose={() => setEmoji(null)} onPick={(icon) => updatePage(pageId, { icon })} />}
      {cover && (
        <Popover anchor={cover} onClose={() => setCover(null)} width={300}>
          <div className="cover-grid">
            {COVERS.map((c) => (
              <button key={c} className="cover-swatch" style={{ background: c }} onClick={() => { updatePage(pageId, { cover: c }); setCover(null); }} aria-label="Portada" />
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

function EmptyPageHints({ pageId }: { pageId: ID }) {
  const ui = useUI();
  return (
    <div className="empty-hints">
      <span className="muted small">Empieza con:</span>
      <button className="btn ghost sm" onClick={() => ui.openAI({ pageId })}><Sparkles size={14} /> Escribir con IA</button>
      <button className="btn ghost sm" onClick={() => ui.openTemplates(pageId)}><LayoutTemplate size={14} /> Plantillas</button>
    </div>
  );
}

function RowProperties({ rowId }: { rowId: ID }) {
  const row = useStore((s) => s.ws.pages[rowId]);
  const dbPage = useStore((s) => (row?.dbId ? s.ws.pages[row.dbId] : undefined));
  const [menu, setMenu] = useState<{ propId: ID; anchor: Anchor; isNew?: boolean } | null>(null);
  if (!row || !dbPage?.database) return null;
  const db = dbPage.database;
  return (
    <div className="row-props">
      <div className="row-props-source muted small">
        En <button className="link-btn" onClick={() => useStore.getState().navigate(dbPage.id)}>{dbPage.icon} {pageTitle(dbPage)}</button>
      </div>
      {db.properties.filter((p) => p.type !== "title").map((p) => (
        <div key={p.id} className="row-prop">
          <button className="row-prop-name" onClick={(e) => setMenu({ propId: p.id, anchor: anchorFrom(e.currentTarget) })}>
            <span className="prop-icon">{propIcon(p.type)}</span>
            {p.name}
          </button>
          <Cell dbId={dbPage.id} row={row} prop={p} className="row-prop-value" />
        </div>
      ))}
      <button
        className="btn ghost sm"
        onClick={(e) => {
          const anchor = anchorFrom(e.currentTarget);
          const id = useStore.getState().addProperty(dbPage.id, { name: "Propiedad", type: "text" });
          setMenu({ propId: id, anchor, isNew: true });
        }}
      >
        <Plus size={14} /> Añadir propiedad
      </button>
      <hr className="row-props-sep" />
      {menu && <PropertyMenu dbId={dbPage.id} propId={menu.propId} anchor={menu.anchor} isNew={menu.isNew} onClose={() => setMenu(null)} />}
    </div>
  );
}
