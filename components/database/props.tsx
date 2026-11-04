"use client";

import { useMemo, useState } from "react";
import { Check, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import type { DateValue, ID, OptionColor, Page, Property, PropValue, SelectOption, StatusGroup, Workspace } from "@/lib/types";
import { getRows, pageTitle, useStore } from "@/lib/store";
import { computeValue, displayText, findOption, formatNumber, isEmpty } from "@/lib/query";
import { addDays, cx, formatDate, todayISO, uid } from "@/lib/utils";
import { Popover, MenuTitle, type Anchor } from "../ui/Popover";
import { COLORS } from "../editor/blockTypes";

export const OPTION_COLORS = COLORS.map((c) => c.id) as OptionColor[];

export function Tag({ option, onRemove }: { option?: SelectOption; onRemove?: () => void }) {
  if (!option) return null;
  return (
    <span className={cx("tag", `tag-${option.color}`)}>
      {option.group && <span className={cx("status-dot", `dot-${option.group}`)} />}
      {option.name}
      {onRemove && (
        <button className="tag-x" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Quitar">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/** read-only rendering of a property value */
export function PropDisplay({ ws, row, prop, dbId, compact }: { ws: Workspace; row: Page; prop: Property; dbId: ID; compact?: boolean }) {
  const db = ws.pages[dbId]?.database;
  if (!db) return null;
  const v = computeValue(ws, row, prop, db);
  if (prop.type === "checkbox") return <input type="checkbox" className="todo-check" checked={v === true} readOnly tabIndex={-1} />;
  if (isEmpty(v)) return compact ? null : <span className="cell-empty" />;
  switch (prop.type) {
    case "select":
    case "status":
      return <Tag option={findOption(prop, v)} />;
    case "multi_select":
      return (
        <span className="tags">
          {(v as string[]).map((id) => <Tag key={id} option={findOption(prop, id)} />)}
        </span>
      );
    case "relation":
      return (
        <span className="tags">
          {(v as string[]).map((id) => {
            const p = ws.pages[id];
            if (!p || p.trashed) return null;
            return (
              <span key={id} className="rel-chip">
                <span>{p.icon || "📄"}</span>
                {pageTitle(p)}
              </span>
            );
          })}
        </span>
      );
    case "date": {
      const d = v as DateValue;
      const overdue = d.start < todayISO() && !isDoneRow(ws, row, db.properties);
      return (
        <span className={cx("date-text", overdue && prop.name !== "Periodo" && "overdue")}>
          {formatDate(d.start)}
          {d.end && ` → ${formatDate(d.end)}`}
        </span>
      );
    }
    case "url":
      return (
        <a className="link" href={String(v)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {String(v).replace(/^https?:\/\//, "")}
        </a>
      );
    case "email":
      return <a className="link" href={`mailto:${v}`} onClick={(e) => e.stopPropagation()}>{String(v)}</a>;
    case "person":
      return (
        <span className="person">
          <span className="avatar-xs">{String(v).trim()[0]?.toUpperCase()}</span>
          {String(v)}
        </span>
      );
    case "number":
      return <span className="num">{formatNumber(Number(v), prop)}</span>;
    case "rollup":
      if (typeof v === "number" && (prop.rollupFn === "percent_done" || prop.rollupFn === "percent_checked")) {
        return (
          <span className="progress">
            <span className="progress-bar"><span style={{ width: `${Math.round(v * 100)}%` }} /></span>
            {Math.round(v * 100)}%
          </span>
        );
      }
      return <span className="num">{displayText(ws, v, prop)}</span>;
    default:
      return <span className="cell-text">{displayText(ws, v, prop)}</span>;
  }
}

function isDoneRow(ws: Workspace, row: Page, props: Property[]) {
  const st = props.find((p) => p.type === "status");
  if (!st) return false;
  return findOption(st, row.props?.[st.id])?.group === "done";
}

/** compact property for cards/lists: labels numbers, hides unchecked boxes */
export function CardProp({ ws, row, prop, dbId }: { ws: Workspace; row: Page; prop: Property; dbId: ID }) {
  const db = ws.pages[dbId]?.database;
  if (!db) return null;
  const v = computeValue(ws, row, prop, db);
  if (prop.type === "checkbox") {
    if (v !== true) return null;
    return <span className="card-check">✓ {prop.name}</span>;
  }
  if (isEmpty(v)) return null;
  const labelled = ["number", "formula", "text", "url", "email"].includes(prop.type) ||
    (prop.type === "rollup" && prop.rollupFn !== "percent_done" && prop.rollupFn !== "percent_checked");
  return (
    <span className="card-prop-inner">
      {labelled && <span className="card-label">{prop.name}</span>}
      <PropDisplay ws={ws} row={row} prop={prop} dbId={dbId} compact />
    </span>
  );
}

/** true when a property is edited inline (input) instead of with a popover */
export function isInlineEditable(prop: Property) {
  return ["title", "text", "number", "url", "email", "person"].includes(prop.type);
}

export function isComputed(prop: Property) {
  return ["rollup", "formula", "created_time"].includes(prop.type);
}

// ---------------------------------------------------------------------------
// editor popover
// ---------------------------------------------------------------------------

export function PropEditor({ dbId, row, prop, anchor, onClose }: { dbId: ID; row: Page; prop: Property; anchor: Anchor; onClose: () => void }) {
  const setRowProp = useStore((s) => s.setRowProp);
  const value = prop.type === "title" ? row.title : row.props?.[prop.id];
  const set = (v: PropValue) => setRowProp(row.id, prop.id, v);

  let body: React.ReactNode = null;
  switch (prop.type) {
    case "select":
    case "status":
    case "multi_select":
      body = <OptionsEditor dbId={dbId} prop={prop} value={value} onChange={set} onDone={prop.type !== "multi_select" ? onClose : undefined} />;
      break;
    case "date":
      body = <DateEditor value={value as DateValue | undefined} onChange={set} />;
      break;
    case "relation":
      body = <RelationEditor prop={prop} row={row} value={(value as string[]) ?? []} onChange={set} />;
      break;
    case "checkbox":
      // checkboxes toggle in place; callers never open an editor for them
      return null;
    default:
      body = <TextEditor prop={prop} value={value} onChange={set} onDone={onClose} />;
  }
  return (
    <Popover anchor={anchor} onClose={onClose} width={prop.type === "relation" ? 320 : 280}>
      {body}
    </Popover>
  );
}

function TextEditor({ prop, value, onChange, onDone }: { prop: Property; value: PropValue; onChange: (v: PropValue) => void; onDone: () => void }) {
  const [v, setV] = useState(value === undefined || value === null ? "" : String(value));
  const commit = () => {
    if (prop.type === "number") onChange(v.trim() === "" ? null : Number(v.replace(",", ".")));
    else onChange(v);
  };
  return (
    <div className="pad-sm">
      <MenuTitle>{prop.name}</MenuTitle>
      <input
        autoFocus
        className="input"
        type={prop.type === "number" ? "number" : prop.type === "email" ? "email" : prop.type === "url" ? "url" : "text"}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            onDone();
          }
        }}
      />
    </div>
  );
}

export function DateEditor({ value, onChange }: { value?: DateValue; onChange: (v: PropValue) => void }) {
  const [hasEnd, setHasEnd] = useState(!!value?.end);
  const start = value?.start ?? "";
  return (
    <div className="pad-sm date-editor">
      <MenuTitle>Fecha</MenuTitle>
      <div className="row gap-sm">
        <input
          autoFocus
          type="date"
          className="input"
          value={start}
          onChange={(e) => onChange(e.target.value ? { start: e.target.value, end: hasEnd ? value?.end ?? e.target.value : undefined } : null)}
        />
        {hasEnd && (
          <input
            type="date"
            className="input"
            value={value?.end ?? ""}
            min={start}
            onChange={(e) => start && onChange({ start, end: e.target.value || undefined })}
          />
        )}
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={hasEnd}
          onChange={(e) => {
            setHasEnd(e.target.checked);
            if (start) onChange({ start, end: e.target.checked ? addDays(start, 1) : undefined });
          }}
        />
        Fecha de fin
      </label>
      <div className="row gap-sm wrap">
        <button className="btn ghost sm" onClick={() => onChange({ start: todayISO(), end: hasEnd ? addDays(todayISO(), 1) : undefined })}>Hoy</button>
        <button className="btn ghost sm" onClick={() => onChange({ start: addDays(todayISO(), 1) })}>Mañana</button>
        <button className="btn ghost sm" onClick={() => onChange({ start: addDays(todayISO(), 7) })}>En una semana</button>
        <button className="btn ghost sm danger" onClick={() => onChange(null)}>Borrar</button>
      </div>
    </div>
  );
}

function OptionsEditor({
  dbId,
  prop,
  value,
  onChange,
  onDone,
}: {
  dbId: ID;
  prop: Property;
  value: PropValue;
  onChange: (v: PropValue) => void;
  onDone?: () => void;
}) {
  const updateProperty = useStore((s) => s.updateProperty);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ID | null>(null);
  const multi = prop.type === "multi_select";
  const selected = multi ? ((value as string[]) ?? []) : value ? [value as string] : [];
  const options = prop.options ?? [];
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());

  const pick = (id: ID) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      onChange(selected[0] === id ? null : id);
      onDone?.();
    }
  };
  const create = () => {
    const name = q.trim();
    if (!name) return;
    const opt: SelectOption = {
      id: uid(),
      name,
      color: OPTION_COLORS[(options.length + 2) % OPTION_COLORS.length],
      ...(prop.type === "status" ? { group: "todo" as StatusGroup } : {}),
    };
    updateProperty(dbId, prop.id, { options: [...options, opt] });
    setQ("");
    pick(opt.id);
  };
  const patchOpt = (id: ID, p: Partial<SelectOption>) =>
    updateProperty(dbId, prop.id, { options: options.map((o) => (o.id === id ? { ...o, ...p } : o)) });

  const editingOpt = options.find((o) => o.id === editing);

  if (editingOpt) {
    return (
      <div className="pad-sm">
        <input className="input" autoFocus value={editingOpt.name} onChange={(e) => patchOpt(editingOpt.id, { name: e.target.value })} />
        {prop.type === "status" && (
          <>
            <MenuTitle>Grupo</MenuTitle>
            <div className="row gap-sm wrap">
              {(["todo", "in_progress", "done"] as StatusGroup[]).map((g) => (
                <button key={g} className={cx("btn sm", editingOpt.group === g ? "primary" : "ghost")} onClick={() => patchOpt(editingOpt.id, { group: g })}>
                  {g === "todo" ? "Por hacer" : g === "in_progress" ? "En curso" : "Hecho"}
                </button>
              ))}
            </div>
          </>
        )}
        <MenuTitle>Color</MenuTitle>
        <div className="color-grid">
          {OPTION_COLORS.map((c) => (
            <button key={c} className={cx("tag", `tag-${c}`, editingOpt.color === c && "ring")} onClick={() => patchOpt(editingOpt.id, { color: c })}>
              {COLORS.find((x) => x.id === c)?.name}
            </button>
          ))}
        </div>
        <div className="row between mt">
          <button
            className="btn ghost sm danger"
            onClick={() => {
              updateProperty(dbId, prop.id, { options: options.filter((o) => o.id !== editingOpt.id) });
              setEditing(null);
            }}
          >
            <Trash2 size={14} /> Eliminar opción
          </button>
          <button className="btn primary sm" onClick={() => setEditing(null)}>Listo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pad-sm">
      <div className="tag-input">
        {selected.map((id) => (
          <Tag key={id} option={findOption(prop, id)} onRemove={() => pick(id)} />
        ))}
        <input
          autoFocus
          placeholder={options.length ? "Busca o crea una opción" : "Escribe para crear una opción"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (filtered[0] && (exact || !q.trim())) pick(filtered.find((o) => o.name.toLowerCase() === q.trim().toLowerCase())?.id ?? filtered[0].id);
              else create();
            }
          }}
        />
      </div>
      <MenuTitle>Selecciona una opción{q.trim() && !exact ? " o crea una" : ""}</MenuTitle>
      <div className="picker-list">
        {filtered.map((o) => (
          <div key={o.id} className={cx("option-row", selected.includes(o.id) && "active")} onClick={() => pick(o.id)}>
            <Tag option={o} />
            <span className="grow" />
            {selected.includes(o.id) && <Check size={14} />}
            <button className="icon-btn xs" aria-label="Editar opción" onClick={(e) => { e.stopPropagation(); setEditing(o.id); }}>
              <MoreHorizontal size={14} />
            </button>
          </div>
        ))}
        {q.trim() && !exact && (
          <button className="menu-item" onClick={create}>
            <span className="menu-icon"><Plus size={14} /></span>
            <span className="menu-label">Crear <span className="tag tag-gray">{q.trim()}</span></span>
          </button>
        )}
      </div>
    </div>
  );
}

function RelationEditor({ prop, row, value, onChange }: { prop: Property; row: Page; value: string[]; onChange: (v: PropValue) => void }) {
  const ws = useStore((s) => s.ws);
  const addRow = useStore((s) => s.addRow);
  const [q, setQ] = useState("");
  const targetDb = prop.targetDbId;
  const candidates = useMemo(() => {
    if (!targetDb) return [];
    return getRows(ws, targetDb)
      .filter((p) => p.id !== row.id && pageTitle(p).toLowerCase().includes(q.toLowerCase()))
      .slice(0, 40);
  }, [ws, targetDb, q, row.id]);
  if (!targetDb || !ws.pages[targetDb]) return <div className="pad-sm muted">Configura la base de datos relacionada.</div>;
  return (
    <div className="pad-sm">
      <MenuTitle>Relacionado con {pageTitle(ws.pages[targetDb])}</MenuTitle>
      <input className="input" autoFocus placeholder="Buscar elementos…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="picker-list">
        {candidates.map((p) => {
          const on = value.includes(p.id);
          return (
            <button key={p.id} className={cx("menu-item", on && "active")} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}>
              <span className="menu-icon">{p.icon || "📄"}</span>
              <span className="menu-label">{pageTitle(p)}</span>
              {on && <Check size={14} />}
            </button>
          );
        })}
        {q.trim() && (
          <button
            className="menu-item"
            onClick={() => {
              const id = addRow(targetDb, {}, { title: q.trim() });
              onChange([...value, id]);
              setQ("");
            }}
          >
            <span className="menu-icon"><Plus size={14} /></span>
            <span className="menu-label">Crear «{q.trim()}»</span>
          </button>
        )}
        {!candidates.length && !q && <div className="menu-empty">No hay elementos todavía</div>}
      </div>
    </div>
  );
}
