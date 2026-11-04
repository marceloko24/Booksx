import type { ReactNode } from "react";
import {
  CheckSquare,
  ChevronRight,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Sparkles,
  Table2,
  Text,
  MessageSquareQuote,
  KanbanSquare,
  CalendarDays,
  LayoutGrid,
  GanttChart,
} from "lucide-react";
import type { BlockType, ViewType } from "@/lib/types";

export interface SlashItem {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  keywords: string;
  group: "Bloques básicos" | "Páginas y bases de datos" | "Multimedia" | "IA";
  /** text block types that can be used in "turn into" */
  blockType?: BlockType;
  /** database view to create */
  view?: ViewType;
  special?: "page" | "link_page" | "ai" | "image" | "divider" | "database";
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: "paragraph", label: "Texto", description: "Escribe texto normal.", icon: <Text size={18} />, keywords: "texto parrafo text paragraph", group: "Bloques básicos", blockType: "paragraph" },
  { id: "h1", label: "Título 1", description: "Encabezado grande.", icon: <Heading1 size={18} />, keywords: "titulo encabezado h1 heading", group: "Bloques básicos", blockType: "h1" },
  { id: "h2", label: "Título 2", description: "Encabezado mediano.", icon: <Heading2 size={18} />, keywords: "titulo encabezado h2 heading", group: "Bloques básicos", blockType: "h2" },
  { id: "h3", label: "Título 3", description: "Encabezado pequeño.", icon: <Heading3 size={18} />, keywords: "titulo encabezado h3 heading", group: "Bloques básicos", blockType: "h3" },
  { id: "todo", label: "Lista de tareas", description: "Casillas para marcar.", icon: <CheckSquare size={18} />, keywords: "tarea todo checkbox casilla", group: "Bloques básicos", blockType: "todo" },
  { id: "bullet", label: "Lista con viñetas", description: "Lista simple.", icon: <List size={18} />, keywords: "lista viñeta bullet", group: "Bloques básicos", blockType: "bullet" },
  { id: "numbered", label: "Lista numerada", description: "Lista con números.", icon: <ListOrdered size={18} />, keywords: "lista numerada numbered", group: "Bloques básicos", blockType: "numbered" },
  { id: "toggle", label: "Desplegable", description: "Oculta contenido dentro.", icon: <ChevronRight size={18} />, keywords: "toggle desplegable plegable", group: "Bloques básicos", blockType: "toggle" },
  { id: "quote", label: "Cita", description: "Resalta una cita.", icon: <Quote size={18} />, keywords: "cita quote", group: "Bloques básicos", blockType: "quote" },
  { id: "callout", label: "Aviso", description: "Destaca un texto con icono.", icon: <MessageSquareQuote size={18} />, keywords: "aviso callout nota destacado", group: "Bloques básicos", blockType: "callout" },
  { id: "code", label: "Código", description: "Bloque de código.", icon: <Code2 size={18} />, keywords: "codigo code", group: "Bloques básicos", blockType: "code" },
  { id: "divider", label: "Divisor", description: "Línea separadora.", icon: <Minus size={18} />, keywords: "divisor separador divider linea", group: "Bloques básicos", special: "divider" },
  { id: "page", label: "Página", description: "Crea una subpágina.", icon: <FileText size={18} />, keywords: "pagina subpagina page", group: "Páginas y bases de datos", special: "page" },
  { id: "link_page", label: "Enlace a página", description: "Enlaza una página existente.", icon: <Link2 size={18} />, keywords: "enlace link mencion pagina", group: "Páginas y bases de datos", special: "link_page" },
  { id: "db_table", label: "Base de datos: tabla", description: "Tabla dentro de la página.", icon: <Table2 size={18} />, keywords: "tabla base datos database table", group: "Páginas y bases de datos", special: "database", view: "table" },
  { id: "db_board", label: "Base de datos: tablero", description: "Kanban por estado.", icon: <KanbanSquare size={18} />, keywords: "kanban tablero board base datos", group: "Páginas y bases de datos", special: "database", view: "board" },
  { id: "db_calendar", label: "Base de datos: calendario", description: "Vista mensual por fecha.", icon: <CalendarDays size={18} />, keywords: "calendario calendar base datos", group: "Páginas y bases de datos", special: "database", view: "calendar" },
  { id: "db_gallery", label: "Base de datos: galería", description: "Tarjetas visuales.", icon: <LayoutGrid size={18} />, keywords: "galeria gallery tarjetas base datos", group: "Páginas y bases de datos", special: "database", view: "gallery" },
  { id: "db_timeline", label: "Base de datos: cronograma", description: "Barras en el tiempo.", icon: <GanttChart size={18} />, keywords: "cronograma timeline gantt base datos", group: "Páginas y bases de datos", special: "database", view: "timeline" },
  { id: "image", label: "Imagen", description: "Inserta una imagen por URL.", icon: <ImageIcon size={18} />, keywords: "imagen image foto", group: "Multimedia", special: "image" },
  { id: "ai", label: "Asistente IA", description: "Escribe, resume o genera ideas.", icon: <Sparkles size={18} />, keywords: "ia ai asistente inteligencia escribir", group: "IA", special: "ai" },
];

export const TURN_INTO = SLASH_ITEMS.filter((i) => i.blockType);

export function filterSlash(q: string): SlashItem[] {
  const query = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!query) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((i) => {
    const hay = `${i.label} ${i.keywords}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return query.split(/\s+/).every((w) => hay.includes(w));
  });
}

export const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  paragraph: "Escribe algo o pulsa «/» para ver comandos…",
  h1: "Título 1",
  h2: "Título 2",
  h3: "Título 3",
  bullet: "Lista",
  numbered: "Lista",
  todo: "Tarea",
  toggle: "Desplegable",
  quote: "Cita",
  callout: "Escribe un aviso…",
  code: "Código",
};

export const TEXT_TYPES: BlockType[] = ["paragraph", "h1", "h2", "h3", "bullet", "numbered", "todo", "toggle", "quote", "callout", "code"];

export const COLORS = [
  { id: "default", name: "Predeterminado" },
  { id: "gray", name: "Gris" },
  { id: "brown", name: "Marrón" },
  { id: "orange", name: "Naranja" },
  { id: "yellow", name: "Amarillo" },
  { id: "green", name: "Verde" },
  { id: "blue", name: "Azul" },
  { id: "purple", name: "Morado" },
  { id: "pink", name: "Rosa" },
  { id: "red", name: "Rojo" },
] as const;
