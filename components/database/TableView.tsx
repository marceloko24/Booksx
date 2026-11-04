"use client";

import { useState, Fragment } from "react";
import { ChevronRight, GripVertical, Maximize2, Plus } from "lucide-react";
import type { Database, ID, Page, Property, View } from "@/lib/types";
import { useStore } from "@/lib/store";
import { computeValue, propIcon, valueForGroup, type QueryResult } from "@/lib/query";
import { cx } from "@/lib/utils";
import { anchorFrom, type Anchor } from "../ui/Popover";
import { PropDisplay, PropEditor, Tag, isComputed, isInlineEditable } from "./props";
import { PropertyMenu } from "./PropertyMenu";
import { RowMenu, visibleProps } from "./DatabaseView";

export interface ViewProps {
  dbId: ID;
  db: Database;
  view: View;
  result: QueryResult;
  onNew: (props?: Record<ID, unknown>) => ID;
}

export function Cell({ dbId, row, prop, className }: { dbId: ID; row: Page; prop: Property; className?: string }) {
  const ws = useStore((s) => s.ws);
  const setRowProp = useStore((s) => s.setRowProp);
  const [editing, setEditing] = useState<Anchor | null>(null);
  const [inline, setInline] = useState(false);

  const value = prop.type === "title" ? row.title : row.props?.[prop.id];

  if (inline) {
    return (
      <div className={cx("cell editing", className)}>
        <input
          autoFocus
          className="cell-input"
          type={prop.type === "number" ? "number" : "text"}
          defaultValue={value === undefined || value === null ? "" : String(value)}
          onBlur={(e) => {
            const v = e.target.value;
            setRowProp(row.id, prop.id, prop.type === "number" ? (v.trim() === "" ? null : Number(v)) : v);
            setInline(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cx("cell", `cell-${prop.type}`, className, isComputed(prop) && "computed")}
      onClick={(e) => {
        if (isComputed(prop)) return;
        if (prop.type === "checkbox") return setRowProp(row.id, prop.id, !value);
        if (isInlineEditable(prop)) return setInline(true);
        setEditing(anchorFrom(e.currentTarget));
      }}
    >
      {prop.type === "title" ? <span className="cell-title-text">{row.title || <span className="muted">Sin título</span>}</span> : <PropDisplay ws={ws} row={row} prop={prop} dbId={dbId} />}
      {editing && <PropEditor dbId={dbId} row={row} prop={prop} anchor={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function TableView({ dbId, db, view, result, onNew }: ViewProps) {
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const props = visibleProps(db, view);
  const [propMenu, setPropMenu] = useState<{ propId: ID; anchor: Anchor; isNew?: boolean } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ rowId: ID; anchor: Anchor } | null>(null);
  const [expanded, setExpanded] = useState<Record<ID, boolean>>({});
  const [drag, setDrag] = useState<ID | null>(null);
  const [over, setOver] = useState<ID | null>(null);
  const width = (p: Property) => view.widths?.[p.id] ?? (p.type === "title" ? 260 : 170);
  const canReorder = view.sorts.length === 0;

  const parentProp = view.showSubItems && db.parentPropId ? db.parentPropId : null;
  const subsProp = parentProp ? db.properties.find((p) => p.id === parentProp)?.syncedPropId : null;

  const startResize = (e: React.MouseEvent, p: Property) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width(p);
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.max(80, startW + ev.clientX - startX);
      document.querySelectorAll<HTMLElement>(`[data-col="${view.id}-${p.id}"]`).forEach((el) => (el.style.width = `${w}px`));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      st().updateView(dbId, view.id, { widths: { ...view.widths, [p.id]: w } });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const addProperty = (e: React.MouseEvent) => {
    const anchor = anchorFrom(e.currentTarget);
    const id = st().addProperty(dbId, { name: "Propiedad", type: "text" });
    if (view.visibleProps) st().updateView(dbId, view.id, { visibleProps: [...view.visibleProps, id] });
    setPropMenu({ propId: id, anchor, isNew: true });
  };

  // position of each row in the sorted/filtered result, used to order sub-items
  const rank = new Map(result.rows.map((r, i) => [r.id, i]));
  const renderRow = (row: Page, depth: number, inResult: Set<ID>): React.ReactNode => {
    const children = subsProp
      ? ((row.props?.[subsProp] as string[] | undefined) ?? [])
          .map((id) => ws.pages[id])
          .filter((p): p is Page => !!p && !p.trashed)
          .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
      : [];
    const isOpen = expanded[row.id];
    return (
      <Fragment key={row.id + depth}>
        <div
          className={cx("tr", over === row.id && drag && drag !== row.id && "drop-before")}
          onContextMenu={(e) => {
            e.preventDefault();
            setRowMenu({ rowId: row.id, anchor: { x: e.clientX, y: e.clientY } });
          }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            setOver(row.id);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag && drag !== row.id) st().moveRow(dbId, drag, db.rowOrder.filter((x) => x !== drag).indexOf(row.id));
            setDrag(null);
            setOver(null);
          }}
        >
          <div className="td-handle">
            {canReorder && depth === 0 && (
              <span
                className="row-grip"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDrag(row.id);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                title="Arrastrar para reordenar"
              >
                <GripVertical size={14} />
              </span>
            )}
          </div>
          {props.map((p) => (
            <div key={p.id} className="td" style={{ width: width(p) }} data-col={`${view.id}-${p.id}`}>
              {p.type === "title" ? (
                <div className="title-cell" style={{ paddingLeft: depth * 18 }}>
                  {subsProp && (
                    <button
                      className={cx("sub-toggle", isOpen && "open", !children.length && "empty")}
                      aria-label="Subtareas"
                      onClick={() => setExpanded((x) => ({ ...x, [row.id]: !x[row.id] }))}
                    >
                      <ChevronRight size={13} />
                    </button>
                  )}
                  {row.icon && <span className="row-icon">{row.icon}</span>}
                  <Cell dbId={dbId} row={row} prop={p} className="grow" />
                  {subsProp && children.length > 0 && <span className="sub-count">{children.length}</span>}
                  <button className="open-btn" onClick={() => st().setPeek(row.id)}>
                    <Maximize2 size={12} /> Abrir
                  </button>
                </div>
              ) : (
                <Cell dbId={dbId} row={row} prop={p} />
              )}
            </div>
          ))}
          <div className="td filler" />
        </div>
        {isOpen && (
          <>
            {children.map((c) => renderRow(c, depth + 1, inResult))}
            <div className="tr add-row sub" style={{ paddingLeft: 32 + (depth + 1) * 18 }} onClick={() => {
              const id = onNew({ [parentProp!]: [row.id] });
              void id;
            }}>
              <Plus size={13} /> Nueva subtarea
            </div>
          </>
        )}
      </Fragment>
    );
  };

  const renderRows = (rows: Page[]) => {
    const ids = new Set(rows.map((r) => r.id));
    // with sub-items: only show rows whose parent is not in the result
    const top = parentProp
      ? rows.filter((r) => {
          const parents = (r.props?.[parentProp] as string[] | undefined) ?? [];
          return !parents.some((p) => ids.has(p));
        })
      : rows;
    return top.map((r) => renderRow(r, 0, ids));
  };

  const groupProp = db.properties.find((p) => p.id === view.groupBy);
  const collapsed = new Set(view.collapsedGroups ?? []);

  const footer = (count: number, extra?: Record<ID, unknown>) => (
    <div className="tr add-row" onClick={() => onNew(extra)}>
      <Plus size={14} /> Nuevo <span className="muted small grow-right">{count} {count === 1 ? "elemento" : "elementos"}</span>
    </div>
  );

  return (
    <div className="table-wrap">
      <div className="table">
        <div className="tr thead">
          <div className="td-handle" />
          {props.map((p) => (
            <div key={p.id} className="th" style={{ width: width(p) }} data-col={`${view.id}-${p.id}`} onClick={(e) => setPropMenu({ propId: p.id, anchor: anchorFrom(e.currentTarget) })}>
              <span className="prop-icon">{propIcon(p.type)}</span>
              <span className="th-name">{p.name}</span>
              <span className="col-resizer" onMouseDown={(e) => startResize(e, p)} onClick={(e) => e.stopPropagation()} />
            </div>
          ))}
          <div className="th add-col" onClick={addProperty} title="Añadir propiedad">
            <Plus size={14} />
          </div>
          <div className="td filler" />
        </div>

        {result.groups && groupProp
          ? result.groups.map((g) => {
              if (g.key === "__none" && g.rows.length === 0) return null;
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key} className="tgroup">
                  <div
                    className="group-head"
                    onClick={() =>
                      st().updateView(dbId, view.id, {
                        collapsedGroups: isCollapsed ? [...collapsed].filter((k) => k !== g.key) : [...collapsed, g.key],
                      })
                    }
                  >
                    <ChevronRight size={14} className={cx("chev", !isCollapsed && "open")} />
                    {g.option ? <Tag option={g.option} /> : <span className="group-label">{g.label}</span>}
                    <span className="muted small">{g.rows.length}</span>
                  </div>
                  {!isCollapsed && (
                    <>
                      {renderRows(g.rows)}
                      {footer(g.rows.length, { [groupProp.id]: valueForGroup(groupProp, g.key) })}
                    </>
                  )}
                </div>
              );
            })
          : (
            <>
              {renderRows(result.rows)}
              {footer(result.rows.length)}
            </>
          )}
        {result.rows.length === 0 && !result.groups && (
          <div className="empty-state small">No hay elementos que coincidan.</div>
        )}
        <Calculations db={db} view={view} rows={result.rows} props={props} width={width} />
      </div>

      {propMenu && <PropertyMenu dbId={dbId} propId={propMenu.propId} view={view} anchor={propMenu.anchor} isNew={propMenu.isNew} onClose={() => setPropMenu(null)} />}
      {rowMenu && <RowMenu dbId={dbId} rowId={rowMenu.rowId} anchor={rowMenu.anchor} onClose={() => setRowMenu(null)} />}
    </div>
  );
}

/** footer with simple aggregations for numeric and checkbox columns */
function Calculations({ db, view, rows, props, width }: { db: Database; view: View; rows: Page[]; props: Property[]; width: (p: Property) => number }) {
  const ws = useStore((s) => s.ws);
  const hasCalc = props.some((p) => p.type === "number" || p.type === "checkbox");
  if (!hasCalc || !rows.length) return null;
  return (
    <div className="tr calc-row">
      <div className="td-handle" />
      {props.map((p) => {
        let text = "";
        if (p.type === "number") {
          const nums = rows.map((r) => Number(computeValue(ws, r, p, db))).filter((n) => !Number.isNaN(n));
          if (nums.length) text = `Suma ${Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100}`;
        }
        if (p.type === "checkbox") {
          const n = rows.filter((r) => computeValue(ws, r, p, db) === true).length;
          text = `${Math.round((n / rows.length) * 100)}% marcadas`;
        }
        if (p.type === "title") text = `${rows.length} en total`;
        return (
          <div key={p.id} className="td calc" style={{ width: width(p) }} data-col={`${view.id}-${p.id}`}>
            {text}
          </div>
        );
      })}
      <div className="td filler" />
    </div>
  );
}
