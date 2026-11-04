# Investigación funcional: apps de productividad por bloques (referencia: Notion)

> **Fuente y límites.** Esta investigación **no** viene de una observación en vivo.
> La red de este entorno bloqueó `notion.so`, `notion.com` y su centro de ayuda (proxy 403 / DNS),
> así que REA no pudo capturar la página. Lo que sigue describe el **comportamiento visible y
> públicamente conocido** de este tipo de producto (patrones de interacción, no implementación).
> No se usó código, marca, iconos ni recursos gráficos de Notion. Cada patrón tiene al lado
> la decisión propia que toma BOOKSX.
>
> Para validarlo con REA más adelante: permite esos dominios en la red del entorno y captura
> páginas públicas (`*.notion.site`) con `capture_browser_scenario` / `analyze_web_bundle`.

## Resumen en 5 líneas
1. Todo es una **página hecha de bloques**; una página puede contener subpáginas y bases de datos, formando un árbol.
2. El editor se maneja casi entero con **teclado**: menú `/`, atajos tipo Markdown, Enter/Backspace/Tab con semántica de bloque.
3. Una **base de datos** es una colección de páginas con **propiedades tipadas**; cada fila se abre como una página completa.
4. Sobre la misma base de datos hay **varias vistas** (tabla, tablero, calendario, galería, timeline, lista), cada una con sus propios filtros, orden y agrupación.
5. **Relaciones + rollups + estados** convierten esas bases en sistemas de proyectos y tareas con subtareas y progreso.

## 1. Editor de páginas y sistema de bloques
| Patrón observado (público) | Decisión BOOKSX |
|---|---|
| Cada párrafo es un bloque independiente con un tipo (texto, títulos H1–H3, lista, numerada, to-do, toggle, cita, callout, código, divisor, imagen, subpágina, base de datos). | Modelo `Block {id, type, html, checked, indent, ...}` en lista plana con `indent` para anidar (más simple de reordenar que un árbol). |
| `/` abre un menú filtrable de tipos de bloque; flechas + Enter para elegir. | `SlashMenu` con búsqueda por nombre y alias en español/inglés. |
| Atajos Markdown al inicio de línea: `# `, `## `, `- `, `1. `, `[] `, `> `, ` ``` `, `---`. | Implementados en `onInput` al detectar prefijo + espacio. |
| Enter divide el bloque; Backspace al inicio convierte a texto o fusiona con el anterior; Tab/Shift+Tab indenta. | Igual, con foco y cursor gestionados por el editor. |
| Asa (⋮⋮) a la izquierda al pasar el ratón: arrastrar para mover, clic para menú (convertir en, duplicar, eliminar, color). | `BlockItem` con asa arrastrable (HTML5 DnD) y `BlockMenu`. |
| Formato en línea con Ctrl+B/I/U, código en línea, enlaces. | `execCommand` + saneado con lista blanca de etiquetas. |

## 2. Barra lateral y navegación
- Secciones: Favoritos, árbol de páginas privadas, plantillas, papelera, ajustes, búsqueda.
- Árbol anidado con flecha para expandir, `+` para crear subpágina y `…` para más acciones al pasar el ratón.
- Se puede reordenar arrastrando, redimensionar y ocultar (Ctrl+\\). Las migas de pan arriba muestran la ruta.
- En móvil la barra se convierte en un cajón deslizante.
- **BOOKSX:** sidebar con ancho ajustable y guardado, reordenar con drag & drop, migas de pan, navegación con hash (`#/p/<id>`) para que funcione el botón Atrás.

## 3. Bases de datos, tablas y propiedades
- Tipos de propiedad: título, texto, número, selección, multiselección, estado (agrupado en Por hacer / En curso / Hecho), fecha (con rango), persona, casilla, URL, email, relación, rollup, fórmula, fecha de creación/edición.
- Las opciones de selección se crean escribiendo y tienen colores.
- Cada fila es una página con su propio contenido de bloques.
- **BOOKSX:** las filas son `Page` con `props`; propiedades title/text/number/select/multi_select/status/date/person/checkbox/url/relation/rollup/formula/created_time.

## 4. Vistas
| Vista | Comportamiento | BOOKSX |
|---|---|---|
| Tabla | Celdas editables, añadir propiedad, redimensionar columnas, cálculos al pie. | Sí, con edición en celda, agrupación y pie con recuento. |
| Tablero (Kanban) | Columnas por selección/estado; arrastrar tarjeta cambia la propiedad. | Sí, con DnD entre columnas y crear tarjeta en columna. |
| Calendario | Cuadrícula mensual por una propiedad de fecha; arrastrar cambia la fecha. | Sí, mensual, crear en día y DnD de fecha. |
| Galería | Tarjetas con vista previa del contenido. | Sí, con portada/icono y propiedades visibles. |
| Timeline | Barras horizontales entre fecha inicio y fin. | Sí, escala por días/semanas y barras desde rango de fecha. |
| Lista | Filas compactas. | Sí. |

## 5. Relaciones entre bases de datos
- Una relación enlaza filas de dos bases de datos; si es bidireccional crea la propiedad recíproca en la otra base.
- Los rollups agregan una propiedad de las filas relacionadas (contar, sumar, promedio, % completado, mostrar originales).
- **BOOKSX:** relaciones bidireccionales sincronizadas (`syncedPropId`) y rollup con count / sum / avg / min / max / percent_checked / percent_status_done / show.

## 6. Filtros, ordenamientos y agrupaciones
- Filtros por propiedad con operadores según el tipo; se combinan con Y / O.
- Varios criterios de orden encadenados.
- Agrupación por una propiedad (selección, estado, casilla, persona) con grupos plegables.
- Cada vista guarda su propia configuración.
- **BOOKSX:** `View {filters, filterMode, sorts, groupBy, ...}` evaluado en `lib/query.ts`.

## 7. Tareas, subtareas y estados
- Patrón típico: base "Proyectos" ↔ base "Tareas" (relación), estado con grupos, responsable, fecha límite, prioridad.
- Subtareas = auto-relación padre/hijo; la tabla las muestra anidadas.
- El progreso del proyecto sale de un rollup sobre el estado de sus tareas.
- **BOOKSX:** plantilla "Proyectos y tareas" que crea ambas bases ya relacionadas, con subtareas y barra de progreso.

## 8. Menús, botones, comandos y atajos
| Atajo | Acción BOOKSX |
|---|---|
| Ctrl/⌘ + K | Búsqueda global y comandos |
| Ctrl/⌘ + \\ | Mostrar/ocultar barra lateral |
| Ctrl/⌘ + Alt + N | Nueva página |
| Ctrl/⌘ + J | Asistente de IA |
| Ctrl/⌘ + Shift + L | Modo oscuro |
| Ctrl/⌘ + D | Duplicar bloque |
| Ctrl/⌘ + Shift + ↑/↓ | Mover bloque |
| Ctrl/⌘ + Enter | Marcar/desmarcar to-do, abrir/cerrar toggle |
| `/` | Menú de bloques |

## 9. Escritorio y móvil
- Escritorio: controles al pasar el ratón, barra lateral fija y paneles laterales ("peek") para abrir filas.
- Móvil: los controles al pasar el ratón no existen, así que hacen falta botones visibles; la barra es un cajón y las tablas y tableros se desplazan en horizontal.
- **BOOKSX:** media queries a 768px, botón de menú, asas siempre visibles en táctil, peek a pantalla completa en móvil.

## 10. Organización y personalización
- Iconos (emoji) y portadas por página, ancho completo, tamaño de letra, tipografía (sans/serif/mono).
- Favoritos, plantillas reutilizables, papelera con restaurar y borrar para siempre.
- **BOOKSX:** todo lo anterior más color de acento del tema, exportar/importar el espacio en JSON y exportar página a Markdown.

## Arquitectura independiente de BOOKSX
- Next.js (App Router) + React + TypeScript; estado con Zustand.
- **Guardado automático** local (localStorage, con espera de 400 ms e indicador "Guardando… / Guardado"). Se puede cambiar por un backend sin tocar la UI (`lib/persistence.ts`).
- IA con la API de Claude en una ruta del servidor (`/api/ai`); la clave nunca llega al navegador.
