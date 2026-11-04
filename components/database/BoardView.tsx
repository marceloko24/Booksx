"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Page } from "@/lib/types";
import { defaultStatusOptions, pageTitle, useStore } from "@/lib/store";
import { computeValue, groupRows, isEmpty, valueForGroup } from "@/lib/query";
import { cx } from "@/lib/utils";
import type { Anchor } from "../ui/Popover";
import { CardProp, Tag } from "./props";
import { RowMenu, visibleProps } from "./DatabaseView";
import type { ViewProps } from "./TableView";

export function BoardView({ dbId, db, view, result, onNew }: ViewProps) {
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; before: string | null } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ rowId: string; anchor: Anchor } | null>(null);

  const groupProp = db.properties.find((p) => p.id === view.groupBy);
  if (!groupProp) {
    const candidates = db.properties.filter((p) => ["select", "status", "multi_select", "checkbox"].includes(p.type));
    return (
      <div className="empty-state">
        <p>Elige la propiedad que define las columnas del tablero.</p>
        <div className="row gap-sm wrap center">
          {candidates.map((p) => (
            <button key={p.id} className="btn ghost sm" onClick={() => st().updateView(dbId, view.id, { groupBy: p.id })}>{p.name}</button>
          ))}
          {!candidates.length && (
            <button
              className="btn primary sm"
              onClick={() => {
                const id = st().addProperty(dbId, { name: "Estado", type: "status", options: defaultStatusOptions() });
                st().updateView(dbId, view.id, { groupBy: id });
              }}
            >
              Crear propiedad Estado
            </button>
          )}
        </div>
      </div>
    );
  }

  const groups = result.groups ?? groupRows(ws, result.rows, groupProp, db);
  const cardProps = visibleProps(db, view).filter((p) => p.type !== "title" && p.id !== groupProp.id);
  const canReorder = view.sorts.length === 0;

  const drop = (colKey: string, beforeId: string | null) => {
    if (!drag) return;
    const row = ws.pages[drag];
    const cur = computeValue(ws, row, groupProp, db);
    let next = valueForGroup(groupProp, colKey);
    if (groupProp.type === "multi_select") {
      // move between columns: replace the source column value with the target one
      const arr = Array.isArray(cur) ? cur.filter((x) => !groups.some((g) => g.key === x && g.rows.includes(row))) : [];
      next = colKey === "__none" ? [] : [...new Set([...arr, colKey])];
    }
    st().setRowProp(drag, groupProp.id, next);
    if (canReorder) {
      const order = db.rowOrder.filter((x) => x !== drag);
      const idx = beforeId ? order.indexOf(beforeId) : (() => {
        const col = groups.find((g) => g.key === colKey);
        const last = col?.rows.filter((r) => r.id !== drag).slice(-1)[0];
        return last ? order.indexOf(last.id) + 1 : order.length;
      })();
      st().moveRow(dbId, drag, idx < 0 ? order.length : idx);
    }
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="board">
      {groups.map((g) => {
        if (g.key === "__none" && !g.rows.length && groupProp.type !== "checkbox") return null;
        return (
          <div
            key={g.key}
            className={cx("board-col", over?.col === g.key && "drop-col")}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              if (over?.col !== g.key || over.before !== null) {
                const target = (e.target as HTMLElement).closest("[data-card]") as HTMLElement | null;
                setOver({ col: g.key, before: target?.dataset.card ?? null });
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(g.key, over?.before ?? null);
            }}
          >
            <div className="board-col-head">
              {g.option ? <Tag option={g.option} /> : <span className="group-label">{g.label}</span>}
              <span className="muted small">{g.rows.length}</span>
              <button className="icon-btn xs push" aria-label="Nueva tarjeta" onClick={() => onNew({ [groupProp.id]: valueForGroup(groupProp, g.key) })}>
                <Plus size={14} />
              </button>
            </div>
            <div className="board-cards">
              {g.rows.map((r) => (
                <Card
                  key={r.id}
                  row={r}
                  dbId={dbId}
                  dragging={drag === r.id}
                  dropBefore={over?.col === g.key && over.before === r.id && drag !== r.id}
                  onDragStart={() => setDrag(r.id)}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  onMenu={(anchor) => setRowMenu({ rowId: r.id, anchor })}
                  props={cardProps}
                />
              ))}
              <button className="board-add" onClick={() => onNew({ [groupProp.id]: valueForGroup(groupProp, g.key) })}>
                <Plus size={14} /> Nuevo
              </button>
            </div>
          </div>
        );
      })}
      {rowMenu && <RowMenu dbId={dbId} rowId={rowMenu.rowId} anchor={rowMenu.anchor} onClose={() => setRowMenu(null)} />}
    </div>
  );
}

function Card({
  row,
  dbId,
  props,
  dragging,
  dropBefore,
  onDragStart,
  onDragEnd,
  onMenu,
}: {
  row: Page;
  dbId: string;
  props: ReturnType<typeof visibleProps>;
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMenu: (a: Anchor) => void;
}) {
  const ws = useStore((s) => s.ws);
  const db = ws.pages[dbId].database!;
  const shown = props.filter((p) => !isEmpty(computeValue(ws, row, p, db)) && (p.type !== "checkbox" || computeValue(ws, row, p, db) === true));
  return (
    <div
      className={cx("card", dragging && "dragging", dropBefore && "drop-before")}
      data-card={row.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => useStore.getState().setPeek(row.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="card-title">
        {row.icon && <span>{row.icon} </span>}
        {pageTitle(row)}
      </div>
      {shown.map((p) => (
        <div key={p.id} className="card-prop" title={p.name}>
          <CardProp ws={ws} row={row} prop={p} dbId={dbId} />
        </div>
      ))}
    </div>
  );
}
