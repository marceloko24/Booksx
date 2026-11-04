"use client";

import { create } from "zustand";
import type {
  Block,
  Database,
  ID,
  Page,
  Property,
  PropValue,
  Settings,
  View,
  Workspace,
} from "./types";
import { uid } from "./utils";
import { loadWorkspace, scheduleSave } from "./persistence";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function newBlock(partial: Partial<Block> = {}): Block {
  return { id: uid(), type: "paragraph", html: "", indent: 0, ...partial };
}

export function defaultSettings(): Settings {
  return {
    theme: "system",
    accent: "#4f46e5",
    sidebarWidth: 260,
    sidebarOpen: true,
    userName: "Yo",
  };
}

export function emptyWorkspace(): Workspace {
  return {
    version: 1,
    name: "Mi espacio BOOKSX",
    pages: {},
    rootOrder: [],
    childOrder: {},
    settings: defaultSettings(),
  };
}

export function defaultView(type: View["type"], db: Database, name?: string): View {
  const dateProp = db.properties.find((p) => p.type === "date")?.id;
  const groupProp =
    db.properties.find((p) => p.type === "status")?.id ??
    db.properties.find((p) => p.type === "select")?.id;
  const names: Record<View["type"], string> = {
    table: "Tabla",
    board: "Tablero",
    calendar: "Calendario",
    gallery: "Galería",
    timeline: "Cronograma",
    list: "Lista",
  };
  return {
    id: uid(),
    name: name ?? names[type],
    type,
    filters: [],
    filterMode: "and",
    sorts: [],
    groupBy: type === "board" ? groupProp : undefined,
    dateProp: type === "calendar" || type === "timeline" ? dateProp : undefined,
    timelineScale: "day",
  };
}

export function defaultDatabase(): Database {
  const db: Database = {
    properties: [
      { id: "title", name: "Nombre", type: "title" },
      {
        id: uid(),
        name: "Estado",
        type: "status",
        options: defaultStatusOptions(),
      },
      { id: uid(), name: "Fecha", type: "date" },
    ],
    views: [],
    rowOrder: [],
  };
  db.views.push(defaultView("table", db));
  return db;
}

export function defaultStatusOptions() {
  return [
    { id: uid(), name: "Por hacer", color: "gray" as const, group: "todo" as const },
    { id: uid(), name: "En curso", color: "blue" as const, group: "in_progress" as const },
    { id: uid(), name: "Hecho", color: "green" as const, group: "done" as const },
  ];
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface CreatePageInput {
  parentId?: ID | null;
  title?: string;
  icon?: string;
  cover?: string;
  blocks?: Block[];
  database?: Database;
  inline?: boolean;
  /** index in parent's child list; append when undefined */
  index?: number;
  /** add a page/database block into the parent's content (default true) */
  addBlockToParent?: boolean;
  /** insert the reference block after this block id */
  afterBlockId?: ID;
}

interface State {
  ws: Workspace;
  hydrated: boolean;
  saveState: SaveState;
  lastSavedAt: number | null;
  currentPageId: ID | null;
  peekRowId: ID | null;

  hydrate: () => void;
  setSaveState: (s: SaveState, at?: number) => void;
  navigate: (id: ID | null) => void;
  setPeek: (id: ID | null) => void;

  // pages
  createPage: (input?: CreatePageInput) => ID;
  updatePage: (id: ID, patch: Partial<Page>) => void;
  setBlocks: (id: ID, blocks: Block[]) => void;
  trashPage: (id: ID) => void;
  restorePage: (id: ID) => void;
  deleteForever: (id: ID) => void;
  emptyTrash: () => void;
  duplicatePage: (id: ID) => ID | null;
  movePage: (id: ID, newParentId: ID | null, index?: number) => void;
  toggleFavorite: (id: ID) => void;

  // databases
  addProperty: (dbId: ID, prop: Omit<Property, "id"> & { id?: ID }, withBacklink?: boolean) => ID;
  updateProperty: (dbId: ID, propId: ID, patch: Partial<Property>) => void;
  deleteProperty: (dbId: ID, propId: ID) => void;
  moveProperty: (dbId: ID, propId: ID, toIndex: number) => void;
  addRow: (dbId: ID, props?: Record<ID, PropValue>, opts?: { title?: string; index?: number; blocks?: Block[] }) => ID;
  setRowProp: (rowId: ID, propId: ID, value: PropValue) => void;
  moveRow: (dbId: ID, rowId: ID, toIndex: number) => void;
  addView: (dbId: ID, view: View) => void;
  updateView: (dbId: ID, viewId: ID, patch: Partial<View>) => void;
  deleteView: (dbId: ID, viewId: ID) => void;

  // settings / workspace
  updateSettings: (patch: Partial<Settings>) => void;
  renameWorkspace: (name: string) => void;
  replaceWorkspace: (ws: Workspace) => void;
}

const now = () => Date.now();

function touch(page: Page, patch: Partial<Page>): Page {
  return { ...page, ...patch, updatedAt: now() };
}

/** All descendant page ids (sidebar children + database rows). */
export function descendants(ws: Workspace, id: ID): ID[] {
  const out: ID[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of Object.values(ws.pages)) {
      if ((p.parentId === cur || p.dbId === cur) && p.id !== cur && !out.includes(p.id)) {
        out.push(p.id);
        stack.push(p.id);
      }
    }
  }
  return out;
}

function removeFromOrders(ws: Workspace, id: ID): Pick<Workspace, "rootOrder" | "childOrder"> {
  const childOrder: Record<ID, ID[]> = {};
  for (const [k, v] of Object.entries(ws.childOrder)) {
    childOrder[k] = v.includes(id) ? v.filter((x) => x !== id) : v;
  }
  return { rootOrder: ws.rootOrder.filter((x) => x !== id), childOrder };
}

function insertAt<T>(arr: T[], item: T, index?: number): T[] {
  const copy = arr.slice();
  if (index === undefined || index < 0 || index > copy.length) copy.push(item);
  else copy.splice(index, 0, item);
  return copy;
}

export const useStore = create<State>((set, get) => {
  /** apply a workspace mutation and schedule autosave */
  const commit = (fn: (ws: Workspace) => Workspace) => {
    set((s) => {
      const ws = fn(s.ws);
      return { ws };
    });
    scheduleSave(get().ws);
  };

  const patchPages = (ws: Workspace, pages: Record<ID, Page>): Workspace => ({
    ...ws,
    pages: { ...ws.pages, ...pages },
  });

  const updateDb = (ws: Workspace, dbId: ID, fn: (db: Database) => Database): Workspace => {
    const page = ws.pages[dbId];
    if (!page?.database) return ws;
    return patchPages(ws, { [dbId]: touch(page, { database: fn(page.database) }) });
  };

  return {
    ws: emptyWorkspace(),
    hydrated: false,
    saveState: "idle",
    lastSavedAt: null,
    currentPageId: null,
    peekRowId: null,

    hydrate: () => {
      const ws = loadWorkspace();
      set({ ws: ws ?? emptyWorkspace(), hydrated: true });
    },
    setSaveState: (saveState, at) =>
      set((s) => ({ saveState, lastSavedAt: at ?? s.lastSavedAt })),
    navigate: (id) => set({ currentPageId: id, peekRowId: null }),
    setPeek: (id) => set({ peekRowId: id }),

    // ------------------------------------------------------------------ pages
    createPage: (input = {}) => {
      const id = uid();
      const parentId = input.parentId ?? null;
      const page: Page = {
        id,
        title: input.title ?? "",
        icon: input.icon,
        cover: input.cover,
        parentId,
        blocks: input.blocks ?? [newBlock()],
        database: input.database,
        inline: input.inline,
        createdAt: now(),
        updatedAt: now(),
      };
      commit((ws) => {
        let next: Workspace = patchPages(ws, { [id]: page });
        if (parentId) {
          next = {
            ...next,
            childOrder: {
              ...next.childOrder,
              [parentId]: insertAt(next.childOrder[parentId] ?? [], id, input.index),
            },
          };
          const parent = next.pages[parentId];
          if (parent && input.addBlockToParent !== false) {
            const ref = newBlock({ type: input.database ? "database" : "page", refId: id });
            let blocks = parent.blocks.slice();
            const afterIdx = input.afterBlockId
              ? blocks.findIndex((b) => b.id === input.afterBlockId)
              : -1;
            if (afterIdx >= 0) blocks.splice(afterIdx + 1, 0, ref);
            else {
              // replace a trailing empty paragraph if present
              const last = blocks[blocks.length - 1];
              if (last && last.type === "paragraph" && !last.html) blocks = blocks.slice(0, -1);
              blocks.push(ref, newBlock());
            }
            next = patchPages(next, { [parentId]: touch(parent, { blocks }) });
          }
        } else {
          next = { ...next, rootOrder: insertAt(next.rootOrder, id, input.index) };
        }
        return next;
      });
      return id;
    },

    updatePage: (id, patch) =>
      commit((ws) => (ws.pages[id] ? patchPages(ws, { [id]: touch(ws.pages[id], patch) }) : ws)),

    setBlocks: (id, blocks) =>
      commit((ws) => {
        const page = ws.pages[id];
        if (!page) return ws;
        // trash sub-pages whose reference block disappeared
        const before = new Set(page.blocks.filter((b) => b.refId).map((b) => b.refId!));
        const after = new Set(blocks.filter((b) => b.refId).map((b) => b.refId!));
        let next = patchPages(ws, { [id]: touch(page, { blocks }) });
        for (const ref of before) {
          if (!after.has(ref) && next.pages[ref] && next.pages[ref].parentId === id) {
            next = trashIn(next, ref);
          }
        }
        return next;
      }),

    trashPage: (id) => {
      commit((ws) => {
        let next = trashIn(ws, id);
        // remove reference block from parent
        const page = ws.pages[id];
        if (page?.parentId && next.pages[page.parentId]) {
          const parent = next.pages[page.parentId];
          next = patchPages(next, {
            [parent.id]: touch(parent, { blocks: parent.blocks.filter((b) => b.refId !== id) }),
          });
        }
        return next;
      });
      const cur = get().currentPageId;
      if (cur && (cur === id || descendants(get().ws, id).includes(cur))) {
        const parent = get().ws.pages[id]?.parentId ?? null;
        get().navigate(parent);
      }
    },

    restorePage: (id) =>
      commit((ws) => {
        const page = ws.pages[id];
        if (!page) return ws;
        const ids = [id, ...descendants(ws, id)];
        const pages: Record<ID, Page> = {};
        for (const pid of ids) pages[pid] = { ...ws.pages[pid], trashed: false };
        let next = patchPages(ws, pages);
        // if parent is gone or trashed, restore at root
        const parent = page.parentId ? next.pages[page.parentId] : null;
        if (!page.dbId) {
          if (!parent || parent.trashed) {
            next = patchPages(next, { [id]: { ...next.pages[id], parentId: null } });
            if (!next.rootOrder.includes(id)) next = { ...next, rootOrder: [...next.rootOrder, id] };
          } else {
            const kids = next.childOrder[parent.id] ?? [];
            if (!kids.includes(id))
              next = { ...next, childOrder: { ...next.childOrder, [parent.id]: [...kids, id] } };
            if (!parent.blocks.some((b) => b.refId === id)) {
              next = patchPages(next, {
                [parent.id]: touch(parent, {
                  blocks: [...parent.blocks, newBlock({ type: page.database ? "database" : "page", refId: id })],
                }),
              });
            }
          }
        }
        return next;
      }),

    deleteForever: (id) =>
      commit((ws) => {
        const ids = [id, ...descendants(ws, id)];
        const pages = { ...ws.pages };
        for (const pid of ids) delete pages[pid];
        let next: Workspace = { ...ws, pages };
        for (const pid of ids) next = { ...next, ...removeFromOrders(next, pid) };
        const childOrder = { ...next.childOrder };
        for (const pid of ids) delete childOrder[pid];
        return { ...next, childOrder };
      }),

    emptyTrash: () => {
      const trashedRoots = Object.values(get().ws.pages).filter((p) => p.trashed);
      for (const p of trashedRoots) if (get().ws.pages[p.id]) get().deleteForever(p.id);
    },

    duplicatePage: (id) => {
      const ws = get().ws;
      const src = ws.pages[id];
      if (!src) return null;
      const map = new Map<ID, ID>();
      const all = [id, ...descendants(ws, id)];
      for (const pid of all) map.set(pid, uid());
      const remap = (x: ID | null | undefined) => (x && map.has(x) ? map.get(x)! : x);
      const pages: Record<ID, Page> = {};
      const childOrder: Record<ID, ID[]> = {};
      for (const pid of all) {
        const p = ws.pages[pid];
        const copy: Page = structuredClone(p);
        copy.id = map.get(pid)!;
        copy.parentId = remap(p.parentId) ?? null;
        copy.dbId = remap(p.dbId) ?? undefined;
        copy.favorite = false;
        copy.createdAt = copy.updatedAt = now();
        copy.blocks = copy.blocks.map((b) => ({ ...b, id: uid(), refId: remap(b.refId) ?? undefined }));
        if (copy.database) copy.database.rowOrder = copy.database.rowOrder.map((r) => remap(r)!);
        if (copy.props) {
          for (const [k, v] of Object.entries(copy.props)) {
            if (Array.isArray(v)) copy.props[k] = v.map((x) => remap(x)!);
          }
        }
        if (pid === id) copy.title = `${src.title || "Sin título"} (copia)`;
        pages[copy.id] = copy;
        if (ws.childOrder[pid]) childOrder[copy.id] = ws.childOrder[pid].map((c) => remap(c)!);
      }
      const newId = map.get(id)!;
      commit((w) => {
        let next: Workspace = { ...w, pages: { ...w.pages, ...pages }, childOrder: { ...w.childOrder, ...childOrder } };
        if (src.dbId) {
          next = updateDbStatic(next, src.dbId, (db) => {
            const idx = db.rowOrder.indexOf(id);
            return { ...db, rowOrder: insertAt(db.rowOrder, newId, idx + 1) };
          });
        } else if (src.parentId) {
          const kids = next.childOrder[src.parentId] ?? [];
          next = {
            ...next,
            childOrder: { ...next.childOrder, [src.parentId]: insertAt(kids, newId, kids.indexOf(id) + 1) },
          };
          const parent = next.pages[src.parentId];
          const bi = parent.blocks.findIndex((b) => b.refId === id);
          const blocks = parent.blocks.slice();
          blocks.splice(bi + 1, 0, newBlock({ type: src.database ? "database" : "page", refId: newId }));
          next = patchPages(next, { [parent.id]: touch(parent, { blocks }) });
        } else {
          next = { ...next, rootOrder: insertAt(next.rootOrder, newId, next.rootOrder.indexOf(id) + 1) };
        }
        return next;
      });
      return newId;
    },

    movePage: (id, newParentId, index) =>
      commit((ws) => {
        const page = ws.pages[id];
        if (!page || page.dbId) return ws;
        if (newParentId && (newParentId === id || descendants(ws, id).includes(newParentId))) return ws;
        const oldParentId = page.parentId;
        let next: Workspace = { ...ws, ...removeFromOrders(ws, id) };
        // remove block from old parent
        if (oldParentId && next.pages[oldParentId] && oldParentId !== newParentId) {
          const op = next.pages[oldParentId];
          next = patchPages(next, { [op.id]: touch(op, { blocks: op.blocks.filter((b) => b.refId !== id) }) });
        }
        next = patchPages(next, { [id]: touch(page, { parentId: newParentId }) });
        if (newParentId) {
          next = {
            ...next,
            childOrder: { ...next.childOrder, [newParentId]: insertAt(next.childOrder[newParentId] ?? [], id, index) },
          };
          const np = next.pages[newParentId];
          if (!np.blocks.some((b) => b.refId === id)) {
            next = patchPages(next, {
              [np.id]: touch(np, {
                blocks: [...np.blocks, newBlock({ type: page.database ? "database" : "page", refId: id })],
              }),
            });
          }
        } else {
          next = { ...next, rootOrder: insertAt(next.rootOrder, id, index) };
        }
        return next;
      }),

    toggleFavorite: (id) =>
      commit((ws) => (ws.pages[id] ? patchPages(ws, { [id]: { ...ws.pages[id], favorite: !ws.pages[id].favorite } }) : ws)),

    // -------------------------------------------------------------- databases
    addProperty: (dbId, prop, withBacklink = true) => {
      const id = prop.id ?? uid();
      commit((ws) => {
        let next = updateDb(ws, dbId, (db) => ({ ...db, properties: [...db.properties, { ...prop, id } as Property] }));
        // two-way relation: create reciprocal property in target db
        if (prop.type === "relation" && prop.targetDbId && withBacklink) {
          const target = next.pages[prop.targetDbId];
          const source = next.pages[dbId];
          if (target?.database) {
            const backId = uid();
            const sameDb = prop.targetDbId === dbId;
            next = updateDb(next, prop.targetDbId, (db) => ({
              ...db,
              properties: [
                ...db.properties,
                {
                  id: backId,
                  name: sameDb ? `${prop.name} (inversa)` : source?.title || "Relación",
                  type: "relation",
                  targetDbId: dbId,
                  syncedPropId: id,
                },
              ],
            }));
            next = updateDb(next, dbId, (db) => ({
              ...db,
              properties: db.properties.map((p) => (p.id === id ? { ...p, syncedPropId: backId } : p)),
            }));
          }
        }
        return next;
      });
      return id;
    },

    updateProperty: (dbId, propId, patch) =>
      commit((ws) =>
        updateDb(ws, dbId, (db) => ({
          ...db,
          properties: db.properties.map((p) => (p.id === propId ? { ...p, ...patch } : p)),
        })),
      ),

    deleteProperty: (dbId, propId) =>
      commit((ws) => {
        if (propId === "title") return ws;
        const prop = ws.pages[dbId]?.database?.properties.find((p) => p.id === propId);
        let next = updateDb(ws, dbId, (db) => ({
          ...db,
          properties: db.properties.filter((p) => p.id !== propId),
          views: db.views.map((v) => ({
            ...v,
            filters: v.filters.filter((f) => f.propId !== propId),
            sorts: v.sorts.filter((s) => s.propId !== propId),
            groupBy: v.groupBy === propId ? undefined : v.groupBy,
            dateProp: v.dateProp === propId ? undefined : v.dateProp,
          })),
          parentPropId: db.parentPropId === propId ? undefined : db.parentPropId,
        }));
        // drop the reciprocal side of a relation
        if (prop?.type === "relation" && prop.syncedPropId && prop.targetDbId) {
          next = updateDb(next, prop.targetDbId, (db) => ({
            ...db,
            properties: db.properties.map((p) =>
              p.id === prop.syncedPropId ? { ...p, syncedPropId: undefined } : p,
            ),
          }));
        }
        return next;
      }),

    moveProperty: (dbId, propId, toIndex) =>
      commit((ws) =>
        updateDb(ws, dbId, (db) => {
          const props = db.properties.slice();
          const from = props.findIndex((p) => p.id === propId);
          if (from <= 0) return db;
          const [p] = props.splice(from, 1);
          props.splice(Math.max(1, toIndex), 0, p);
          return { ...db, properties: props };
        }),
      ),

    addRow: (dbId, props = {}, opts = {}) => {
      const id = uid();
      const row: Page = {
        id,
        title: opts.title ?? "",
        parentId: dbId,
        dbId,
        props: { ...props },
        blocks: opts.blocks ?? [newBlock()],
        createdAt: now(),
        updatedAt: now(),
      };
      commit((ws) => {
        let next = patchPages(ws, { [id]: row });
        next = updateDb(next, dbId, (db) => ({ ...db, rowOrder: insertAt(db.rowOrder, id, opts.index) }));
        return next;
      });
      // sync relations given at creation
      const db = get().ws.pages[dbId]?.database;
      if (db) {
        for (const p of db.properties) {
          if (p.type === "relation" && Array.isArray(props[p.id]) && (props[p.id] as string[]).length) {
            const val = props[p.id] as string[];
            // reset then set so the sync logic sees the diff
            set((s) => ({
              ws: patchPages(s.ws, { [id]: { ...s.ws.pages[id], props: { ...s.ws.pages[id].props, [p.id]: [] } } }),
            }));
            get().setRowProp(id, p.id, val);
          }
        }
      }
      return id;
    },

    setRowProp: (rowId, propId, value) =>
      commit((ws) => {
        const row = ws.pages[rowId];
        if (!row?.dbId) return ws;
        if (propId === "title") return patchPages(ws, { [rowId]: touch(row, { title: String(value ?? "") }) });
        const db = ws.pages[row.dbId]?.database;
        const prop = db?.properties.find((p) => p.id === propId);
        const prev = row.props?.[propId];
        let next = patchPages(ws, { [rowId]: touch(row, { props: { ...row.props, [propId]: value } }) });
        if (prop?.type === "relation" && prop.syncedPropId && prop.targetDbId) {
          const before = new Set(Array.isArray(prev) ? prev : []);
          const after = new Set(Array.isArray(value) ? (value as string[]) : []);
          const synced = prop.syncedPropId;
          for (const otherId of new Set([...before, ...after])) {
            const other = next.pages[otherId];
            if (!other) continue;
            const cur = new Set((other.props?.[synced] as string[] | undefined) ?? []);
            if (after.has(otherId)) cur.add(rowId);
            else cur.delete(rowId);
            next = patchPages(next, { [otherId]: touch(other, { props: { ...other.props, [synced]: [...cur] } }) });
          }
        }
        return next;
      }),

    moveRow: (dbId, rowId, toIndex) =>
      commit((ws) =>
        updateDb(ws, dbId, (db) => {
          const order = db.rowOrder.filter((r) => r !== rowId);
          order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, rowId);
          return { ...db, rowOrder: order };
        }),
      ),

    addView: (dbId, view) => commit((ws) => updateDb(ws, dbId, (db) => ({ ...db, views: [...db.views, view] }))),
    updateView: (dbId, viewId, patch) =>
      commit((ws) =>
        updateDb(ws, dbId, (db) => ({ ...db, views: db.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)) })),
      ),
    deleteView: (dbId, viewId) =>
      commit((ws) =>
        updateDb(ws, dbId, (db) =>
          db.views.length <= 1 ? db : { ...db, views: db.views.filter((v) => v.id !== viewId) },
        ),
      ),

    // --------------------------------------------------------------- settings
    updateSettings: (patch) => commit((ws) => ({ ...ws, settings: { ...ws.settings, ...patch } })),
    renameWorkspace: (name) => commit((ws) => ({ ...ws, name })),
    replaceWorkspace: (ws) => {
      set({ ws, currentPageId: ws.rootOrder[0] ?? null, peekRowId: null });
      scheduleSave(ws);
    },
  };
});

function trashIn(ws: Workspace, id: ID): Workspace {
  const ids = [id, ...descendants(ws, id)];
  const pages: Record<ID, Page> = {};
  for (const pid of ids) if (ws.pages[pid]) pages[pid] = { ...ws.pages[pid], trashed: true, favorite: false };
  return { ...ws, pages: { ...ws.pages, ...pages } };
}

function updateDbStatic(ws: Workspace, dbId: ID, fn: (db: Database) => Database): Workspace {
  const page = ws.pages[dbId];
  if (!page?.database) return ws;
  return { ...ws, pages: { ...ws.pages, [dbId]: { ...page, database: fn(page.database), updatedAt: Date.now() } } };
}

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------

export function getRows(ws: Workspace, dbId: ID): Page[] {
  const db = ws.pages[dbId]?.database;
  if (!db) return [];
  const rows: Page[] = [];
  const seen = new Set<ID>();
  for (const id of db.rowOrder) {
    const p = ws.pages[id];
    if (p && !p.trashed && p.dbId === dbId) {
      rows.push(p);
      seen.add(id);
    }
  }
  for (const p of Object.values(ws.pages)) {
    if (p.dbId === dbId && !p.trashed && !seen.has(p.id)) rows.push(p);
  }
  return rows;
}

/** sidebar children (sub-pages and databases, not rows). */
export function getChildren(ws: Workspace, id: ID | null): Page[] {
  const order = id ? ws.childOrder[id] ?? [] : ws.rootOrder;
  return order.map((x) => ws.pages[x]).filter((p): p is Page => !!p && !p.trashed && !p.dbId);
}

export function getBreadcrumb(ws: Workspace, id: ID): Page[] {
  const out: Page[] = [];
  let cur: Page | undefined = ws.pages[id];
  let guard = 0;
  while (cur && guard++ < 50) {
    out.unshift(cur);
    cur = cur.parentId ? ws.pages[cur.parentId] : undefined;
  }
  return out;
}

export function pageTitle(p: Page | undefined): string {
  return p?.title?.trim() || "Sin título";
}
