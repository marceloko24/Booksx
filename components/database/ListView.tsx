"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { pageTitle, useStore } from "@/lib/store";
import { computeValue, isEmpty } from "@/lib/query";
import type { Anchor } from "../ui/Popover";
import { CardProp, Tag } from "./props";
import { RowMenu, visibleProps } from "./DatabaseView";
import type { ViewProps } from "./TableView";
import type { Page } from "@/lib/types";

export function ListView({ dbId, db, view, result, onNew }: ViewProps) {
  const ws = useStore((s) => s.ws);
  const [rowMenu, setRowMenu] = useState<{ rowId: string; anchor: Anchor } | null>(null);
  const props = visibleProps(db, view).filter((p) => p.type !== "title");

  const item = (r: Page) => (
    <div
      key={r.id}
      className="list-item"
      onClick={() => useStore.getState().setPeek(r.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        setRowMenu({ rowId: r.id, anchor: { x: e.clientX, y: e.clientY } });
      }}
    >
      <span className="list-icon">{r.icon || <FileText size={15} />}</span>
      <span className="list-title">{pageTitle(r)}</span>
      <span className="list-props">
        {props
          .filter((p) => !isEmpty(computeValue(ws, r, p, db)) && (p.type !== "checkbox" || computeValue(ws, r, p, db) === true))
          .map((p) => (
            <span key={p.id} title={p.name}>
              <CardProp ws={ws} row={r} prop={p} dbId={dbId} />
            </span>
          ))}
      </span>
    </div>
  );

  return (
    <div className="list-view">
      {result.groups
        ? result.groups.filter((g) => g.rows.length).map((g) => (
            <div key={g.key}>
              <div className="group-head">{g.option ? <Tag option={g.option} /> : <span className="group-label">{g.label}</span>} <span className="muted small">{g.rows.length}</span></div>
              {g.rows.map(item)}
            </div>
          ))
        : result.rows.map(item)}
      <div className="tr add-row" onClick={() => onNew()}>
        <Plus size={14} /> Nuevo
      </div>
      {rowMenu && <RowMenu dbId={dbId} rowId={rowMenu.rowId} anchor={rowMenu.anchor} onClose={() => setRowMenu(null)} />}
    </div>
  );
}
