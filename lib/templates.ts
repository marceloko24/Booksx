"use client";

import type { Block, BlockType, Database, ID, Property, PropValue } from "./types";
import { defaultStatusOptions, defaultView, newBlock, useStore } from "./store";
import { addDays, todayISO, uid } from "./utils";

const b = (type: BlockType, html = "", extra: Partial<Block> = {}): Block => newBlock({ type, html, ...extra });

export interface Template {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: "Personal" | "Trabajo" | "Proyectos" | "Conocimiento";
  /** creates the content and returns the new page id */
  create: (parentId: ID | null) => ID;
}

function store() {
  return useStore.getState();
}

function opt(name: string, color: string) {
  return { id: uid(), name, color: color as never };
}

// ---------------------------------------------------------------------------
// database builders
// ---------------------------------------------------------------------------

interface DbSpec {
  title: string;
  icon: string;
  parentId: ID | null;
  properties: Property[];
  views: Array<Parameters<typeof defaultView>[0] | { type: Parameters<typeof defaultView>[0]; name?: string; groupBy?: string; dateProp?: string }>;
  inline?: boolean;
  description?: string;
}

function createDatabase(spec: DbSpec): ID {
  const db: Database = {
    properties: [{ id: "title", name: "Nombre", type: "title" }, ...spec.properties],
    views: [],
    rowOrder: [],
  };
  for (const v of spec.views) {
    const conf = typeof v === "string" ? { type: v } : v;
    const view = defaultView(conf.type, db, "name" in conf ? conf.name : undefined);
    if ("groupBy" in conf && conf.groupBy) view.groupBy = conf.groupBy;
    if ("dateProp" in conf && conf.dateProp) view.dateProp = conf.dateProp;
    db.views.push(view);
  }
  return store().createPage({
    parentId: spec.parentId,
    title: spec.title,
    icon: spec.icon,
    database: db,
    inline: spec.inline,
    blocks: spec.description ? [b("paragraph", spec.description)] : [],
  });
}

export function createProjectsAndTasks(parentId: ID | null, withSample = true): ID {
  const s = store();
  const hub = s.createPage({
    parentId,
    title: "Proyectos y tareas",
    icon: "🚀",
    cover: "linear-gradient(120deg,#6366f1,#22d3ee)",
    blocks: [
      b("callout", "Gestiona proyectos, tareas y subtareas. Las tareas están relacionadas con su proyecto y el progreso se calcula solo.", { emoji: "💡" }),
    ],
  });

  const statusP = { id: uid(), name: "Estado", type: "status" as const, options: defaultStatusOptions() };
  const priority = {
    id: uid(),
    name: "Prioridad",
    type: "select" as const,
    options: [opt("Alta", "red"), opt("Media", "yellow"), opt("Baja", "gray")],
  };
  const due = { id: uid(), name: "Fecha", type: "date" as const };
  const owner = { id: uid(), name: "Responsable", type: "person" as const };
  const estimate = { id: uid(), name: "Horas", type: "number" as const };

  const tasks = createDatabase({
    parentId: hub,
    title: "Tareas",
    icon: "✅",
    properties: [statusP, priority, due, owner, estimate, { id: uid(), name: "Hecha", type: "checkbox" }],
    views: [
      { type: "board", name: "Tablero", groupBy: statusP.id },
      { type: "table", name: "Todas" },
      { type: "calendar", name: "Calendario", dateProp: due.id },
      { type: "timeline", name: "Cronograma", dateProp: due.id },
    ],
  });

  const projStatus = {
    id: uid(),
    name: "Estado",
    type: "status" as const,
    options: [
      { id: uid(), name: "Planificado", color: "gray" as const, group: "todo" as const },
      { id: uid(), name: "Activo", color: "blue" as const, group: "in_progress" as const },
      { id: uid(), name: "Completado", color: "green" as const, group: "done" as const },
    ],
  };
  const projDates = { id: uid(), name: "Periodo", type: "date" as const };
  const client = { id: uid(), name: "Cliente", type: "text" as const };
  const projects = createDatabase({
    parentId: hub,
    title: "Proyectos",
    icon: "📁",
    properties: [projStatus, projDates, client],
    views: [
      { type: "gallery", name: "Galería" },
      { type: "table", name: "Tabla" },
      { type: "timeline", name: "Cronograma", dateProp: projDates.id },
    ],
  });

  // relations: Tasks.Proyecto <-> Projects.Tareas
  const relId = s.addProperty(tasks, { name: "Proyecto", type: "relation", targetDbId: projects });
  const backId = store().ws.pages[tasks].database!.properties.find((p) => p.id === relId)!.syncedPropId!;
  s.updateProperty(projects, backId, { name: "Tareas" });
  s.addProperty(projects, {
    name: "Progreso",
    type: "rollup",
    relationPropId: backId,
    targetPropId: statusP.id,
    rollupFn: "percent_done",
  });
  s.addProperty(projects, { name: "Horas totales", type: "rollup", relationPropId: backId, targetPropId: estimate.id, rollupFn: "sum" });

  // sub-tasks: self relation
  const parentRel = s.addProperty(tasks, { name: "Tarea padre", type: "relation", targetDbId: tasks });
  const subRel = store().ws.pages[tasks].database!.properties.find((p) => p.id === parentRel)!.syncedPropId!;
  s.updateProperty(tasks, subRel, { name: "Subtareas" });
  const tasksPage = store().ws.pages[tasks];
  s.updatePage(tasks, {
    database: {
      ...tasksPage.database!,
      parentPropId: parentRel,
      views: tasksPage.database!.views.map((v) => (v.type === "table" ? { ...v, showSubItems: true } : v)),
    },
  });

  if (withSample) {
    const t = todayISO();
    const [todo, doing, done] = statusP.options;
    const [alta, media, baja] = priority.options;
    const pWeb = s.addRow(projects, { [projStatus.id]: projStatus.options[1].id, [projDates.id]: { start: addDays(t, -7), end: addDays(t, 21) }, [client.id]: "Café Aurora (demo)" }, { title: "Lanzamiento de la tienda online" });
    const pApp = s.addRow(projects, { [projStatus.id]: projStatus.options[0].id, [projDates.id]: { start: addDays(t, 10), end: addDays(t, 45) }, [client.id]: "Hotel Brisa (demo)" }, { title: "App de reservas" });

    const mk = (title: string, st: string, pr: string, d: number, h: number, proj: ID, len = 2): ID =>
      s.addRow(tasks, {
        [statusP.id]: st,
        [priority.id]: pr,
        [due.id]: { start: addDays(t, d), end: addDays(t, d + len) },
        [owner.id]: "Ana (demo)",
        [estimate.id]: h,
        [relId]: [proj],
      }, { title });

    const t1 = mk("Diseñar la portada", doing.id, alta.id, -2, 6, pWeb);
    mk("Escribir textos de producto", todo.id, media.id, 1, 4, pWeb);
    mk("Configurar pagos de prueba", todo.id, alta.id, 4, 5, pWeb, 3);
    mk("Elegir dominio", done.id, baja.id, -6, 1, pWeb, 0);
    mk("Investigar usuarios", todo.id, media.id, 12, 8, pApp, 5);
    const sub1 = s.addRow(tasks, { [statusP.id]: done.id, [estimate.id]: 2 }, { title: "Boceto en papel" });
    const sub2 = s.addRow(tasks, { [statusP.id]: doing.id, [estimate.id]: 3 }, { title: "Versión en alta fidelidad" });
    s.setRowProp(t1, subRel, [sub1, sub2]);
  }
  return hub;
}

function createSimpleTasks(parentId: ID | null): ID {
  const statusP = { id: uid(), name: "Estado", type: "status" as const, options: defaultStatusOptions() };
  const due = { id: uid(), name: "Fecha", type: "date" as const };
  const id = createDatabase({
    parentId,
    title: "Lista de tareas",
    icon: "☑️",
    properties: [statusP, due, { id: uid(), name: "Etiquetas", type: "multi_select", options: [opt("Casa", "green"), opt("Trabajo", "blue"), opt("Recados", "orange")] }],
    views: [{ type: "board", name: "Tablero", groupBy: statusP.id }, "table", { type: "calendar", dateProp: due.id }],
  });
  const s = store();
  s.addRow(id, { [statusP.id]: statusP.options[0].id, [due.id]: { start: todayISO() } }, { title: "Mi primera tarea" });
  return id;
}

function createReadingList(parentId: ID | null): ID {
  const statusP = {
    id: uid(),
    name: "Estado",
    type: "status" as const,
    options: [
      { id: uid(), name: "Pendiente", color: "gray" as const, group: "todo" as const },
      { id: uid(), name: "Leyendo", color: "yellow" as const, group: "in_progress" as const },
      { id: uid(), name: "Terminado", color: "green" as const, group: "done" as const },
    ],
  };
  const rating = { id: uid(), name: "Valoración", type: "select" as const, options: [opt("★★★★★", "yellow"), opt("★★★★", "yellow"), opt("★★★", "orange"), opt("★★", "gray")] };
  const author = { id: uid(), name: "Autor", type: "text" as const };
  const id = createDatabase({
    parentId,
    title: "Biblioteca",
    icon: "📚",
    properties: [statusP, author, rating, { id: uid(), name: "Género", type: "multi_select", options: [opt("Ensayo", "blue"), opt("Novela", "purple"), opt("Negocios", "green")] }],
    views: [{ type: "gallery", name: "Estantería" }, { type: "board", groupBy: statusP.id }, "table"],
  });
  const s = store();
  s.addRow(id, { [statusP.id]: statusP.options[1].id, [author.id]: "Autora de ejemplo" }, { title: "Libro de ejemplo 1", blocks: [b("paragraph", "Notas de lectura…")] });
  s.addRow(id, { [statusP.id]: statusP.options[0].id, [author.id]: "Autor de ejemplo" }, { title: "Libro de ejemplo 2" });
  return id;
}

function createContentCalendar(parentId: ID | null): ID {
  const date = { id: uid(), name: "Publicación", type: "date" as const };
  const channel = { id: uid(), name: "Canal", type: "select" as const, options: [opt("Blog", "blue"), opt("Instagram", "pink"), opt("Newsletter", "green")] };
  const statusP = { id: uid(), name: "Estado", type: "status" as const, options: defaultStatusOptions() };
  const id = createDatabase({
    parentId,
    title: "Calendario de contenidos",
    icon: "🗓️",
    properties: [date, channel, statusP],
    views: [{ type: "calendar", dateProp: date.id }, { type: "board", groupBy: channel.id }, "list"],
  });
  const s = store();
  s.addRow(id, { [date.id]: { start: addDays(todayISO(), 2) }, [channel.id]: channel.options[0].id, [statusP.id]: statusP.options[0].id }, { title: "Artículo: 5 ideas" });
  s.addRow(id, { [date.id]: { start: addDays(todayISO(), 5) }, [channel.id]: channel.options[1].id, [statusP.id]: statusP.options[1].id }, { title: "Carrusel del producto" });
  return id;
}

function createCRM(parentId: ID | null): ID {
  const stage = {
    id: uid(),
    name: "Etapa",
    type: "select" as const,
    options: [opt("Contacto", "gray"), opt("Propuesta", "blue"), opt("Negociación", "orange"), opt("Ganado", "green"), opt("Perdido", "red")],
  };
  const value = { id: uid(), name: "Valor", type: "number" as const, numberFormat: "currency" as const };
  const id = createDatabase({
    parentId,
    title: "Clientes (CRM)",
    icon: "🤝",
    properties: [stage, value, { id: uid(), name: "Correo", type: "email" }, { id: uid(), name: "Próximo contacto", type: "date" }],
    views: [{ type: "board", name: "Embudo", groupBy: stage.id }, "table"],
  });
  const s = store();
  s.addRow(id, { [stage.id]: stage.options[1].id, [value.id]: 1200 }, { title: "Empresa Ficticia S.A." });
  s.addRow(id, { [stage.id]: stage.options[0].id, [value.id]: 450 }, { title: "Estudio Demo" });
  return id;
}

// ---------------------------------------------------------------------------
// template catalog
// ---------------------------------------------------------------------------

const page = (parentId: ID | null, title: string, icon: string, blocks: Block[], cover?: string) =>
  store().createPage({ parentId, title, icon, blocks, cover });

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Página en blanco",
    icon: "📄",
    description: "Empieza desde cero.",
    category: "Personal",
    create: (p) => page(p, "", "", [b("paragraph")]),
  },
  {
    id: "meeting",
    name: "Notas de reunión",
    icon: "🗒️",
    description: "Agenda, notas y acciones con responsables.",
    category: "Trabajo",
    create: (p) =>
      page(p, `Reunión ${todayISO()}`, "🗒️", [
        b("callout", `<b>Fecha:</b> ${todayISO()} · <b>Asistentes:</b> `, { emoji: "📅" }),
        b("h2", "Agenda"),
        b("numbered", "Revisión de la semana"),
        b("numbered", "Bloqueos"),
        b("h2", "Notas"),
        b("bullet", ""),
        b("h2", "Acciones"),
        b("todo", "Tarea — responsable — fecha"),
      ]),
  },
  {
    id: "journal",
    name: "Diario",
    icon: "📓",
    description: "Reflexión diaria con gratitud y prioridades.",
    category: "Personal",
    create: (p) =>
      page(p, `Diario · ${todayISO()}`, "📓", [
        b("h3", "Tres prioridades de hoy"),
        b("todo"),
        b("todo"),
        b("todo"),
        b("h3", "Agradezco…"),
        b("bullet"),
        b("h3", "Notas"),
        b("paragraph"),
      ], "linear-gradient(120deg,#fde68a,#fca5a5)"),
  },
  {
    id: "wiki",
    name: "Wiki del equipo",
    icon: "📘",
    description: "Base de conocimiento con secciones plegables.",
    category: "Conocimiento",
    create: (p) => {
      const id = page(p, "Wiki del equipo", "📘", [
        b("paragraph", "Todo lo que el equipo necesita saber, en un solo lugar."),
        b("divider"),
        b("toggle", "<b>¿Cómo pedimos vacaciones?</b>", { open: true }),
        b("paragraph", "Escribe aquí el proceso.", { indent: 1 }),
        b("toggle", "<b>Herramientas que usamos</b>"),
        b("bullet", "BOOKSX para documentación", { indent: 1 }),
      ], "linear-gradient(120deg,#a5b4fc,#f0abfc)");
      page(id, "Bienvenida", "👋", [b("paragraph", "Primeros pasos para nuevas personas.")]);
      page(id, "Procesos", "⚙️", [b("paragraph", "Documenta cada proceso aquí.")]);
      return id;
    },
  },
  {
    id: "tasks",
    name: "Lista de tareas",
    icon: "☑️",
    description: "Tablero Kanban con estados, fechas y etiquetas.",
    category: "Personal",
    create: createSimpleTasks,
  },
  {
    id: "projects",
    name: "Proyectos y tareas",
    icon: "🚀",
    description: "Dos bases relacionadas, subtareas, progreso y cronograma.",
    category: "Proyectos",
    create: (p) => createProjectsAndTasks(p, true),
  },
  {
    id: "content",
    name: "Calendario de contenidos",
    icon: "🗓️",
    description: "Planifica publicaciones por fecha y canal.",
    category: "Trabajo",
    create: createContentCalendar,
  },
  {
    id: "crm",
    name: "CRM sencillo",
    icon: "🤝",
    description: "Embudo de ventas por etapas con valor.",
    category: "Trabajo",
    create: createCRM,
  },
  {
    id: "reading",
    name: "Biblioteca de lectura",
    icon: "📚",
    description: "Galería de libros con estado y valoración.",
    category: "Conocimiento",
    create: createReadingList,
  },
];

// ---------------------------------------------------------------------------
// first-run seed
// ---------------------------------------------------------------------------

export function seedWorkspace() {
  const s = store();
  const welcome = s.createPage({
    title: "Bienvenido a BOOKSX",
    icon: "👋",
    cover: "linear-gradient(120deg,#4f46e5,#06b6d4)",
    blocks: [
      b("paragraph", "BOOKSX es tu espacio de trabajo: páginas, bases de datos, tareas e IA en un solo lugar. Todo se <b>guarda automáticamente</b>."),
      b("h2", "Primeros pasos"),
      b("todo", "Escribe <code>/</code> en cualquier línea para insertar un bloque"),
      b("todo", "Prueba los atajos: <code>#</code> título, <code>-</code> lista, <code>[]</code> tarea, <code>&gt;</code> cita"),
      b("todo", "Arrastra el asa ⋮⋮ para reordenar bloques"),
      b("todo", "Pulsa <code>Ctrl/⌘ + K</code> para buscar en todo el espacio"),
      b("todo", "Pulsa <code>Ctrl/⌘ + J</code> para abrir el asistente de IA"),
      b("toggle", "<b>Atajos de teclado</b>"),
      b("bullet", "<code>Ctrl/⌘ + \\</code> mostrar u ocultar la barra lateral", { indent: 1 }),
      b("bullet", "<code>Ctrl/⌘ + Shift + L</code> modo oscuro", { indent: 1 }),
      b("bullet", "<code>Ctrl/⌘ + D</code> duplicar bloque", { indent: 1 }),
      b("bullet", "<code>Ctrl/⌘ + Shift + ↑/↓</code> mover bloque", { indent: 1 }),
      b("callout", "Abre <b>Proyectos y tareas</b> en la barra lateral para ver tablero, tabla, calendario, galería y cronograma con datos de prueba.", { emoji: "🚀" }),
    ],
  });
  createProjectsAndTasks(null, true);
  const notes = s.createPage({ title: "Notas rápidas", icon: "📝", blocks: [b("paragraph", "Apunta ideas aquí.")] });
  s.toggleFavorite(welcome);
  s.toggleFavorite(notes);
  s.navigate(welcome);
  return welcome;
}

export type { PropValue };
