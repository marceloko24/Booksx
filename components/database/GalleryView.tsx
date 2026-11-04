"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { pageTitle, useStore } from "@/lib/store";
import { computeValue, isEmpty } from "@/lib/query";
import { stripTags } from "@/lib/utils";
import type { Anchor } from "../ui/Popover";
import { CardProp, Tag } from "./props";
import { RowMenu, visibleProps } from "./DatabaseView";
import type { ViewProps } from "./TableView";
import type { Page } from "@/lib/types";

export function GalleryView({ dbId, db, view, result, onNew }: ViewProps) {
  const ws = useStore((s) => s.ws);
  const [rowMenu, setRowMenu] = useState<{ rowId: string; anchor: Anchor } | null>(null);
  const props = visibleProps(db, view).filter((p) => p.type !== "title");

  const card = (r: Page) => {
    const img = r.blocks.find((b) => b.type === "image" && b.url)?.url;
    const preview = r.blocks.map((b) => stripTags(b.html)).filter(Boolean).slice(0, 4);
    return (
      <div
        key={r.id}
        className="g-card"
        onClick={() => useStore.getState().setPeek(r.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setRowMenu({ rowId: r.id, anchor: { x: e.clientX, y: e.clientY } });
        }}
      >
        <div className="g-cover" style={r.cover && !img ? { background: r.cover } : undefined}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" />
          ) : r.cover ? null : (
            <div className="g-preview">
              {preview.length ? preview.map((t, i) => <p key={i}>{t}</p>) : <span className="g-icon">{r.icon || "📄"}</span>}
            </div>
          )}
        </div>
        <div className="g-body">
          <div className="card-title">{r.icon && `${r.icon} `}{pageTitle(r)}</div>
          {props
            .filter((p) => !isEmpty(computeValue(ws, r, p, db)) && (p.type !== "checkbox" || computeValue(ws, r, p, db) === true))
            .map((p) => (
              <div key={p.id} className="card-prop" title={p.name}>
                <CardProp ws={ws} row={r} prop={p} dbId={dbId} />
              </div>
            ))}
        </div>
      </div>
    );
  };

  const groups = result.groups;
  return (
    <div className="gallery-wrap">
      {groups ? (
        groups.filter((g) => g.rows.length).map((g) => (
          <div key={g.key} className="g-group">
            <div className="group-head">{g.option ? <Tag option={g.option} /> : <span className="group-label">{g.label}</span>} <span className="muted small">{g.rows.length}</span></div>
            <div className="gallery">{g.rows.map(card)}</div>
          </div>
        ))
      ) : (
        <div className="gallery">
          {result.rows.map(card)}
          <button className="g-card g-new" onClick={() => onNew()}>
            <Plus size={18} /> Nuevo
          </button>
        </div>
      )}
      {rowMenu && <RowMenu dbId={dbId} rowId={rowMenu.rowId} anchor={rowMenu.anchor} onClose={() => setRowMenu(null)} />}
    </div>
  );
}
