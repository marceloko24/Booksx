# BOOKSX

App de productividad con editor de bloques, páginas anidadas, bases de datos dinámicas, tareas y asistente de IA.
Marca y código originales, escritos desde cero con **Next.js + React + TypeScript**. La investigación funcional
(patrones estudiados y decisiones de diseño) está en [`docs/INVESTIGACION.md`](docs/INVESTIGACION.md).

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # añade ANTHROPIC_API_KEY para activar la IA
npm run dev                  # http://localhost:3000
```

Producción: `npm run build && npm start`.

La primera vez, BOOKSX crea un espacio de ejemplo con datos de prueba (proyectos y tareas ficticios).

## Qué incluye

| Área | Funciones |
|---|---|
| **Editor de bloques** | Texto, títulos H1–H3, listas con viñetas y numeradas, tareas, desplegables, cita, aviso, código, divisor, imagen (URL o archivo), subpágina, enlace a página y base de datos en línea. Menú `/` con búsqueda, atajos Markdown (`#`, `-`, `1.`, `[]`, `>`, `>>`, `!`, ` ``` `, `---`), Enter/Retroceso/Tab con lógica de bloque, arrastrar y soltar con el asa ⋮⋮, menú de bloque (convertir en, color, duplicar, mover, eliminar), barra de formato al seleccionar texto (negrita, cursiva, subrayado, tachado, código, enlace, resaltado, IA) y pegado de varias líneas como Markdown. |
| **Páginas** | Páginas y subpáginas anidadas, icono (emoji), portada, ancho completo, texto pequeño, tipografía sans/serif/mono, bloqueo, duplicar, exportar a Markdown y migas de pan. |
| **Barra lateral** | Favoritos, árbol de páginas plegable, arrastrar para reordenar o anidar, renombrar, menú contextual, ancho ajustable, ocultar con `Ctrl/⌘ + \` y cajón deslizante en móvil. |
| **Bases de datos** | Propiedades: título, texto, número (normal/%/moneda), selección, selección múltiple, estado (con grupos), fecha con rango, persona, casilla, URL, correo, **relación** bidireccional, **rollup** (contar, sumar, promedio, mín., máx., % marcadas, % completado, mostrar), **fórmula** (`prop()`, `if`, `concat`, `dateBetween`, `today`, operaciones aritméticas y lógicas) y fecha de creación. Cada fila es una página completa. |
| **Vistas** | Tabla (edición en celda, ancho de columnas, grupos, totales, reordenar filas), Kanban (arrastrar entre columnas), calendario mensual (crear en un día, arrastrar para cambiar la fecha), galería, cronograma (mover y estirar barras, escala de días o semanas) y lista. Cada vista guarda sus propios filtros (Y/O), orden y agrupación. |
| **Tareas y proyectos** | Plantilla «Proyectos y tareas»: dos bases de datos relacionadas con estado, prioridad, fecha, responsable y horas; **subtareas** (auto-relación) anidadas en la tabla y **progreso automático** de cada proyecto. |
| **Búsqueda global** | `Ctrl/⌘ + K`: busca en títulos, contenido y propiedades, resalta las coincidencias e incluye comandos rápidos. |
| **Plantillas** | Notas de reunión, diario, wiki del equipo, lista de tareas, proyectos y tareas, calendario de contenidos, CRM y biblioteca de lectura. |
| **IA** | `Ctrl/⌘ + J` o `/` → Asistente IA: continuar escribiendo, resumir, mejorar, corregir, acortar o alargar, traducir, extraer tareas, lluvia de ideas, esquema o preguntar sobre la página o **todo el espacio**. La respuesta llega en directo y se puede insertar como bloques o en una página nueva. Usa Claude (`claude-opus-5-5`) desde el servidor; la clave nunca llega al navegador. |
| **Guardado automático** | Cada cambio se guarda en menos de 400 ms (indicador «Guardando… / Guardado»). Exportar e importar el espacio completo en JSON. Papelera con restaurar y borrar para siempre. |
| **Diseño** | Interfaz minimalista, modo claro, oscuro o del sistema, color de acento configurable y diseño responsive (probado en móvil con el ancho de un iPhone 13). |

## Atajos de teclado

`Ctrl/⌘+K` buscar · `Ctrl/⌘+J` IA · `Ctrl/⌘+\` barra lateral · `Ctrl/⌘+Alt+N` nueva página · `Ctrl/⌘+Shift+L` modo oscuro ·
`Ctrl/⌘+D` duplicar bloque · `Ctrl/⌘+Shift+↑/↓` mover bloque · `Ctrl/⌘+Enter` marcar tarea / abrir desplegable ·
`Ctrl/⌘+E` código en línea · `Esc` seleccionar bloque (luego `Supr` lo elimina).

## Arquitectura

```
app/                 Next.js App Router (página + /api/ai)
components/          UI: App, Sidebar, Topbar, PageView, RowPeek, modales, AIPanel
  editor/            editor de bloques, menú /, barra de selección, utilidades de cursor
  database/          DatabaseView + vistas (tabla, tablero, calendario, galería, cronograma, lista), propiedades
lib/
  types.ts           modelo de datos (Page, Block, Database, Property, View)
  store.ts           estado con Zustand y todas las mutaciones (páginas, bloques, relaciones, vistas)
  query.ts           filtros, orden, agrupación, rollups e intérprete de fórmulas
  persistence.ts     guardado automático (localStorage); se puede cambiar por un backend sin tocar la UI
  templates.ts       plantillas y espacio de ejemplo
  markdown.ts        Markdown ↔ bloques (pegar, exportar, IA)
```

## Limitaciones conocidas

- Los datos viven en **este navegador** (localStorage, unos 5 MB). No hay sincronización entre dispositivos ni colaboración en tiempo real; para eso, cambia `lib/persistence.ts` por una API con base de datos.
- Deshacer (`Ctrl+Z`) solo funciona dentro del bloque que estás editando (el deshacer nativo del navegador); no hay historial para cambios de estructura.
- Las imágenes subidas como archivo se guardan dentro del espacio (límite de 1,5 MB cada una); para imágenes grandes usa una URL.
