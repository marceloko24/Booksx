"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  Eye,
  Filter as FilterIcon,
  GanttChart,
  Group,
  KanbanSquare,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
  Copy,
  Pencil,
  Maximize2,
} from "lucide-react";
import type { Database, Filter, ID, Property, View, ViewType } from "@/lib/types";
import { defaultView, pageTitle, useStore } from "@/lib/store";
import { OP_LABEL, OPS_BY_TYPE, OPS_WITHOUT_VALUE, propIcon, queryView } from "@/lib/query";
import { cx, uid } from "@/lib/utils";
import { MenuItem, MenuSeparator, MenuTitle, Popover, anchorFrom, type Anchor } from "../ui/Popover";
import { TableView } from "./TableView";
import { BoardView } from "./BoardView";
import { CalendarView } from "./CalendarView";
import { GalleryView } from "./GalleryView";
import { TimelineView } from "./TimelineView";
import { ListView } from "./ListView";
import { EmojiPicker } from "../ui/EmojiPicker";

export const VIEW_ICONS: Record<ViewType, React.ReactNode> = {
  table: <Table2 size={14} />,
  board: <KanbanSquare size={14} />,
  calendar: <CalendarDays size={14} />,
  gallery: <LayoutGrid size={14} />,
  timeline: <GanttChart size={14} />,
  list: <List size={14} />,
};

const VIEW_LABEL: Record<ViewType, string> = {
  table: "Tabla",
  board: "Tablero",
  calendar: "Calendario",
  gallery: "Galería",
  timeline: "Cronograma",
  list: "Lista",
};

export function visibleProps(db: Database, view: View): Property[] {
  const vis = view.visibleProps;
  return db.properties.filter((p) => p.type === "title" || !vis || vis.includes(p.id));
}

const VIEW_KEY = "booksx:activeView:";

export function DatabaseView({ dbId, inline = false }: { dbId: ID; inline?: boolean }) {
  const page = useStore((s) => s.ws.pages[dbId]);
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const db = page?.database;
  const [activeId, setActiveId] = useState<ID | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState<{ kind: "addView" | "viewMenu" | "filter" | "sort" | "group" | "props" | "icon"; anchor: Anchor; viewId?: ID } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY + dbId);
      if (saved) setActiveId(saved);
    } catch {}
  }, [dbId]);

  const view = db?.views.find((v) => v.id === activeId) ?? db?.views[0];
  const result = useMemo(() => (db && view ? queryView(ws, dbId, view, search) : null), [ws, db, view, dbId, search]);

  if (!page || !db || !view || !result) return null;

  const selectView = (id: ID) => {
    setActiveId(id);
    try {
      localStorage.setItem(VIEW_KEY + dbId, id);
    } catch {}
  };
  const updateView = (patch: Partial<View>) => st().updateView(dbId, view.id, patch);

  const addView = (type: ViewType) => {
    const v = defaultView(type, db);
    st().addView(dbId, v);
    selectView(v.id);
    setMenu(null);
  };

  const newRow = (props: Record<ID, unknown> = {}) => {
    // new rows inherit simple "is" filter values so they stay visible
    const inherited: Record<ID, unknown> = {};
    for (const f of view.filters) {
      const p = db.properties.find((x) => x.id === f.propId);
      if (!p || !f.value) continue;
      if ((p.type === "select" || p.type === "status") && f.op === "is") inherited[p.id] = f.value;
      if (p.type === "multi_select" && f.op === "contains") inherited[p.id] = [f.value];
      if (p.type === "checkbox" && f.op === "is_checked") inherited[p.id] = true;
    }
    const id = st().addRow(dbId, { ...inherited, ...props } as never);
    st().setPeek(id);
    return id;
  };

  const activeFilters = view.filters.length;
  const activeSorts = view.sorts.length;
  const groupProp = db.properties.find((p) => p.id === view.groupBy);

  return (
    <div className={cx("dbv", inline && "inline")}>
      {inline && (
        <div className="dbv-title-row">
          <button className="dbv-icon" onClick={(e) => setMenu({ kind: "icon", anchor: anchorFrom(e.currentTarget) })}>
            {page.icon || "🗃️"}
          </button>
          <input
            className="dbv-title"
            value={page.title}
            placeholder="Base de datos sin título"
            onChange={(e) => st().updatePage(dbId, { title: e.target.value })}
          />
          <button className="icon-btn" title="Abrir como página completa" onClick={() => st().navigate(dbId)}>
            <Maximize2 size={15} />
          </button>
        </div>
      )}

      <div className="dbv-bar">
        <div className="view-tabs" role="tablist">
          {db.views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === view.id}
              className={cx("view-tab", v.id === view.id && "active")}
              onClick={(e) => (v.id === view.id ? setMenu({ kind: "viewMenu", anchor: anchorFrom(e.currentTarget), viewId: v.id }) : selectView(v.id))}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ kind: "viewMenu", anchor: { x: e.clientX, y: e.clientY }, viewId: v.id });
              }}
            >
              {VIEW_ICONS[v.type]}
              <span>{v.name}</span>
            </button>
          ))}
          <button className="icon-btn xs" aria-label="Añadir vista" onClick={(e) => setMenu({ kind: "addView", anchor: anchorFrom(e.currentTarget) })}>
            <Plus size={15} />
          </button>
        </div>
        <div className="dbv-tools">
          <button className={cx("tool-btn", activeFilters && "on")} onClick={(e) => setMenu({ kind: "filter", anchor: anchorFrom(e.currentTarget) })}>
            <FilterIcon size={14} /> <span className="hide-sm">Filtrar</span>{activeFilters ? ` ${activeFilters}` : ""}
          </button>
          <button className={cx("tool-btn", activeSorts && "on")} onClick={(e) => setMenu({ kind: "sort", anchor: anchorFrom(e.currentTarget) })}>
            <ArrowUpDown size={14} /> <span className="hide-sm">Ordenar</span>{activeSorts ? ` ${activeSorts}` : ""}
          </button>
          {view.type !== "calendar" && view.type !== "timeline" && (
            <button className={cx("tool-btn", groupProp && "on")} onClick={(e) => setMenu({ kind: "group", anchor: anchorFrom(e.currentTarget) })}>
              <Group size={14} /> <span className="hide-sm">{view.type === "board" ? "Columnas" : "Agrupar"}</span>
            </button>
          )}
          <button className="tool-btn" onClick={(e) => setMenu({ kind: "props", anchor: anchorFrom(e.currentTarget) })}>
            <Eye size={14} /> <span className="hide-sm">Propiedades</span>
          </button>
          {searchOpen ? (
            <span className="db-search">
              <Search size={14} />
              <input autoFocus placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => !search && setSearchOpen(false)} />
              {search && <button className="icon-btn xs" onClick={() => { setSearch(""); setSearchOpen(false); }}><X size={13} /></button>}
            </span>
          ) : (
            <button className="tool-btn" aria-label="Buscar en la base" onClick={() => setSearchOpen(true)}>
              <Search size={14} />
            </button>
          )}
          <button className="btn primary sm" onClick={() => newRow()}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      {(activeFilters > 0 || activeSorts > 0) && (
        <div className="chips">
          {view.sorts.map((s) => {
            const p = db.properties.find((x) => x.id === s.propId);
            return (
              <span key={s.id} className="chip" onClick={(e) => setMenu({ kind: "sort", anchor: anchorFrom(e.currentTarget) })}>
                <ArrowUpDown size={12} /> {p?.name} {s.dir === "asc" ? "↑" : "↓"}
              </span>
            );
          })}
          {view.filters.map((f) => {
            const p = db.properties.find((x) => x.id === f.propId);
            return (
              <span key={f.id} className="chip" onClick={(e) => setMenu({ kind: "filter", anchor: anchorFrom(e.currentTarget) })}>
                <FilterIcon size={12} /> {p?.name} {OP_LABEL[f.op]} {filterValueLabel(p, f)}
                <button className="chip-x" aria-label="Quitar filtro" onClick={(e) => { e.stopPropagation(); updateView({ filters: view.filters.filter((x) => x.id !== f.id) }); }}>
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="dbv-body">
        {view.type === "table" && <TableView dbId={dbId} db={db} view={view} result={result} onNew={newRow} />}
        {view.type === "board" && <BoardView dbId={dbId} db={db} view={view} result={result} onNew={newRow} />}
        {view.type === "calendar" && <CalendarView dbId={dbId} db={db} view={view} rows={result.rows} onNew={newRow} />}
        {view.type === "gallery" && <GalleryView dbId={dbId} db={db} view={view} result={result} onNew={newRow} />}
        {view.type === "timeline" && <TimelineView dbId={dbId} db={db} view={view} rows={result.rows} onNew={newRow} />}
        {view.type === "list" && <ListView dbId={dbId} db={db} view={view} result={result} onNew={newRow} />}
      </div>

      {/* ---------------- menus ---------------- */}
      {menu?.kind === "icon" && (
        <EmojiPicker anchor={menu.anchor} onClose={() => setMenu(null)} onPick={(icon) => st().updatePage(dbId, { icon })} />
      )}
      {menu?.kind === "addView" && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={220}>
          <MenuTitle>Añadir vista</MenuTitle>
          {(Object.keys(VIEW_LABEL) as ViewType[]).map((t) => (
            <MenuItem key={t} icon={VIEW_ICONS[t]} label={VIEW_LABEL[t]} onClick={() => addView(t)} />
          ))}
        </Popover>
      )}
      {menu?.kind === "viewMenu" && (
        <ViewMenu dbId={dbId} db={db} viewId={menu.viewId!} anchor={menu.anchor} onClose={() => setMenu(null)} onSelect={selectView} />
      )}
      {menu?.kind === "filter" && <FilterMenu db={db} view={view} anchor={menu.anchor} onClose={() => setMenu(null)} onChange={updateView} />}
      {menu?.kind === "sort" && <SortMenu db={db} view={view} anchor={menu.anchor} onClose={() => setMenu(null)} onChange={updateView} />}
      {menu?.kind === "group" && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={240}>
          <MenuTitle>{view.type === "board" ? "Columnas según" : "Agrupar por"}</MenuTitle>
          {view.type !== "board" && <MenuItem label="Ninguno" active={!view.groupBy} onClick={() => { updateView({ groupBy: undefined }); setMenu(null); }} />}
          {db.properties
            .filter((p) => (view.type === "board" ? ["select", "status", "multi_select", "checkbox", "person"].includes(p.type) : p.type !== "title" && p.type !== "rollup" && p.type !== "formula"))
            .map((p) => (
              <MenuItem key={p.id} icon={<span className="prop-icon">{propIcon(p.type)}</span>} label={p.name} active={view.groupBy === p.id} onClick={() => { updateView({ groupBy: p.id }); setMenu(null); }} />
            ))}
          {view.type === "table" && db.parentPropId && (
            <>
              <MenuSeparator />
              <label className="check-row pad-sm">
                <input type="checkbox" checked={!!view.showSubItems} onChange={(e) => updateView({ showSubItems: e.target.checked })} />
                Mostrar subtareas anidadas
              </label>
            </>
          )}
        </Popover>
      )}
      {menu?.kind === "props" && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={260}>
          <MenuTitle>Propiedades visibles</MenuTitle>
          {db.properties.map((p) => {
            const visible = p.type === "title" || !view.visibleProps || view.visibleProps.includes(p.id);
            return (
              <label key={p.id} className="check-row pad-sm">
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={p.type === "title"}
                  onChange={() => {
                    const cur = view.visibleProps ?? db.properties.map((x) => x.id);
                    updateView({ visibleProps: visible ? cur.filter((x) => x !== p.id) : [...cur, p.id] });
                  }}
                />
                <span className="prop-icon">{propIcon(p.type)}</span> {p.name}
              </label>
            );
          })}
          {(view.type === "calendar" || view.type === "timeline") && (
            <>
              <MenuSeparator />
              <MenuTitle>Fecha usada</MenuTitle>
              {db.properties.filter((p) => p.type === "date" || p.type === "created_time").map((p) => (
                <MenuItem key={p.id} label={p.name} active={view.dateProp === p.id} onClick={() => updateView({ dateProp: p.id })} />
              ))}
            </>
          )}
        </Popover>
      )}
    </div>
  );
}

function filterValueLabel(p: Property | undefined, f: Filter) {
  if (!p || OPS_WITHOUT_VALUE.includes(f.op)) return "";
  if (!f.value) return "…";
  if (p.options) return p.options.find((o) => o.id === f.value)?.name ?? "";
  if (p.type === "relation") return pageTitle(useStore.getState().ws.pages[f.value]);
  return `«${f.value}»`;
}

function ViewMenu({ dbId, db, viewId, anchor, onClose, onSelect }: { dbId: ID; db: Database; viewId: ID; anchor: Anchor; onClose: () => void; onSelect: (id: ID) => void }) {
  const st = useStore.getState;
  const view = db.views.find((v) => v.id === viewId);
  if (!view) return null;
  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <div className="pad-sm">
        <input className="input" value={view.name} onChange={(e) => st().updateView(dbId, viewId, { name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onClose()} aria-label="Nombre de la vista" />
      </div>
      <MenuTitle>Tipo de vista</MenuTitle>
      {(Object.keys(VIEW_LABEL) as ViewType[]).map((t) => (
        <MenuItem
          key={t}
          icon={VIEW_ICONS[t]}
          label={VIEW_LABEL[t]}
          active={view.type === t}
          onClick={() => {
            const fresh = defaultView(t, db);
            st().updateView(dbId, viewId, {
              type: t,
              groupBy: t === "board" ? view.groupBy ?? fresh.groupBy : view.groupBy,
              dateProp: view.dateProp ?? fresh.dateProp,
            });
          }}
        />
      ))}
      <MenuSeparator />
      <MenuItem
        icon={<Copy size={15} />}
        label="Duplicar vista"
        onClick={() => {
          const copy = { ...structuredClone(view), id: uid(), name: `${view.name} (copia)` };
          st().addView(dbId, copy);
          onSelect(copy.id);
          onClose();
        }}
      />
      <MenuItem icon={<Pencil size={15} />} label="Renombrar" onClick={() => (document.querySelector(".popover input") as HTMLInputElement | null)?.select()} />
      {db.views.length > 1 && (
        <MenuItem
          danger
          icon={<Trash2 size={15} />}
          label="Eliminar vista"
          onClick={() => {
            st().deleteView(dbId, viewId);
            onClose();
          }}
        />
      )}
    </Popover>
  );
}

function FilterMenu({ db, view, anchor, onClose, onChange }: { db: Database; view: View; anchor: Anchor; onClose: () => void; onChange: (p: Partial<View>) => void }) {
  const ws = useStore((s) => s.ws);
  const filters = view.filters;
  const set = (id: ID, patch: Partial<Filter>) => onChange({ filters: filters.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const add = () => {
    const p = db.properties[0];
    onChange({ filters: [...filters, { id: uid(), propId: p.id, op: OPS_BY_TYPE[p.type][0] }] });
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={520}>
      <div className="pad-sm filter-menu">
        {filters.length === 0 && <div className="muted small">Sin filtros. Añade uno para limitar lo que ves.</div>}
        {filters.map((f, i) => {
          const prop = db.properties.find((p) => p.id === f.propId) ?? db.properties[0];
          const ops = OPS_BY_TYPE[prop.type];
          return (
            <div key={f.id} className="filter-row">
              <span className="filter-join">
                {i === 0 ? (
                  "Donde"
                ) : i === 1 ? (
                  <select className="input sm" value={view.filterMode} onChange={(e) => onChange({ filterMode: e.target.value as View["filterMode"] })}>
                    <option value="and">y</option>
                    <option value="or">o</option>
                  </select>
                ) : view.filterMode === "and" ? "y" : "o"}
              </span>
              <select
                className="input sm"
                value={f.propId}
                onChange={(e) => {
                  const np = db.properties.find((p) => p.id === e.target.value)!;
                  set(f.id, { propId: np.id, op: OPS_BY_TYPE[np.type][0], value: undefined });
                }}
              >
                {db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="input sm" value={f.op} onChange={(e) => set(f.id, { op: e.target.value as Filter["op"] })}>
                {ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
              </select>
              {!OPS_WITHOUT_VALUE.includes(f.op) && (
                prop.options ? (
                  <select className="input sm" value={f.value ?? ""} onChange={(e) => set(f.id, { value: e.target.value || undefined })}>
                    <option value="">Elige…</option>
                    {prop.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : prop.type === "relation" && prop.targetDbId ? (
                  <select className="input sm" value={f.value ?? ""} onChange={(e) => set(f.id, { value: e.target.value || undefined })}>
                    <option value="">Elige…</option>
                    {Object.values(ws.pages).filter((p) => p.dbId === prop.targetDbId && !p.trashed).map((p) => <option key={p.id} value={p.id}>{pageTitle(p)}</option>)}
                  </select>
                ) : (
                  <input
                    className="input sm"
                    type={prop.type === "date" || prop.type === "created_time" ? "date" : prop.type === "number" || prop.type === "rollup" ? "number" : "text"}
                    value={f.value ?? ""}
                    placeholder="Valor"
                    onChange={(e) => set(f.id, { value: e.target.value === "" ? undefined : e.target.value })}
                  />
                )
              )}
              <button className="icon-btn xs" aria-label="Quitar filtro" onClick={() => onChange({ filters: filters.filter((x) => x.id !== f.id) })}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        <div className="row gap-sm mt">
          <button className="btn ghost sm" onClick={add}><Plus size={14} /> Añadir filtro</button>
          {filters.length > 0 && <button className="btn ghost sm danger" onClick={() => onChange({ filters: [] })}>Quitar todos</button>}
        </div>
      </div>
    </Popover>
  );
}

function SortMenu({ db, view, anchor, onClose, onChange }: { db: Database; view: View; anchor: Anchor; onClose: () => void; onChange: (p: Partial<View>) => void }) {
  const sorts = view.sorts;
  return (
    <Popover anchor={anchor} onClose={onClose} width={400}>
      <div className="pad-sm">
        {sorts.length === 0 && <div className="muted small">Sin ordenación. Se respeta el orden manual (arrastrando filas).</div>}
        {sorts.map((s, i) => (
          <div key={s.id} className="filter-row">
            <span className="filter-join">{i === 0 ? "Por" : "luego"}</span>
            <select className="input sm" value={s.propId} onChange={(e) => onChange({ sorts: sorts.map((x) => (x.id === s.id ? { ...x, propId: e.target.value } : x)) })}>
              {db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="input sm" value={s.dir} onChange={(e) => onChange({ sorts: sorts.map((x) => (x.id === s.id ? { ...x, dir: e.target.value as "asc" | "desc" } : x)) })}>
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
            <button className="icon-btn xs" aria-label="Quitar orden" onClick={() => onChange({ sorts: sorts.filter((x) => x.id !== s.id) })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="row gap-sm mt">
          <button className="btn ghost sm" onClick={() => onChange({ sorts: [...sorts, { id: uid(), propId: db.properties[0].id, dir: "asc" }] })}>
            <Plus size={14} /> Añadir criterio
          </button>
          {sorts.length > 0 && <button className="btn ghost sm danger" onClick={() => onChange({ sorts: [] })}>Quitar todos</button>}
        </div>
      </div>
    </Popover>
  );
}

/** shared row context menu */
export function RowMenu({ dbId, rowId, anchor, onClose }: { dbId: ID; rowId: ID; anchor: Anchor; onClose: () => void }) {
  const st = useStore.getState;
  return (
    <Popover anchor={anchor} onClose={onClose} width={220}>
      <MenuItem icon={<Maximize2 size={15} />} label="Abrir en panel" onClick={() => { st().setPeek(rowId); onClose(); }} />
      <MenuItem icon={<MoreHorizontal size={15} />} label="Abrir como página" onClick={() => { st().navigate(rowId); onClose(); }} />
      <MenuItem icon={<Copy size={15} />} label="Duplicar" onClick={() => { st().duplicatePage(rowId); onClose(); }} />
      <MenuSeparator />
      <MenuItem danger icon={<Trash2 size={15} />} label="Eliminar" onClick={() => { st().trashPage(rowId); onClose(); void dbId; }} />
    </Popover>
  );
}
