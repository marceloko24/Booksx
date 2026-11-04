export type ID = string;

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "image"
  | "page"
  | "database";

export type BlockColor =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export interface Block {
  id: ID;
  type: BlockType;
  /** Sanitized inline HTML (b, i, u, s, code, a, br). */
  html: string;
  indent: number;
  checked?: boolean;
  /** toggle open state */
  open?: boolean;
  color?: BlockColor;
  /** callout emoji */
  emoji?: string;
  /** image url */
  url?: string;
  /** code language */
  language?: string;
  /** linked page id (type "page") or database page id (type "database") */
  refId?: ID;
}

export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "person"
  | "checkbox"
  | "url"
  | "email"
  | "relation"
  | "rollup"
  | "formula"
  | "created_time";

export type OptionColor = Exclude<BlockColor, "default"> | "default";

export interface SelectOption {
  id: ID;
  name: string;
  color: OptionColor;
  /** only for status options */
  group?: StatusGroup;
}

export type StatusGroup = "todo" | "in_progress" | "done";

export type RollupFn =
  | "count"
  | "count_values"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "percent_checked"
  | "percent_done"
  | "show";

export interface Property {
  id: ID;
  name: string;
  type: PropertyType;
  options?: SelectOption[];
  /** relation */
  targetDbId?: ID;
  syncedPropId?: ID;
  /** rollup */
  relationPropId?: ID;
  targetPropId?: ID;
  rollupFn?: RollupFn;
  /** formula expression, e.g. prop("Precio") * prop("Cantidad") */
  expression?: string;
  /** number format */
  numberFormat?: "plain" | "percent" | "currency";
}

export interface DateValue {
  start: string; // YYYY-MM-DD
  end?: string;
}

export type PropValue =
  | string
  | number
  | boolean
  | string[]
  | DateValue
  | null
  | undefined;

export type ViewType = "table" | "board" | "calendar" | "gallery" | "timeline" | "list";

export type FilterOp =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "starts_with"
  | "is_empty"
  | "is_not_empty"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "is_today"
  | "is_overdue"
  | "is_checked"
  | "is_unchecked";

export interface Filter {
  id: ID;
  propId: ID;
  op: FilterOp;
  value?: string;
}

export interface Sort {
  id: ID;
  propId: ID;
  dir: "asc" | "desc";
}

export interface View {
  id: ID;
  name: string;
  type: ViewType;
  filters: Filter[];
  filterMode: "and" | "or";
  sorts: Sort[];
  groupBy?: ID;
  /** calendar / timeline date property */
  dateProp?: ID;
  /** visible property ids (title is always visible) */
  visibleProps?: ID[];
  /** column widths in table */
  widths?: Record<ID, number>;
  /** collapsed group keys */
  collapsedGroups?: string[];
  /** show sub-items nested (needs db.subItemsPropId) */
  showSubItems?: boolean;
  timelineScale?: "day" | "week";
}

export interface Database {
  /** properties in display order; first is always title */
  properties: Property[];
  views: View[];
  /** relation property (self-relation) that points to the parent row */
  parentPropId?: ID;
  /** order of rows (page ids) */
  rowOrder: ID[];
}

export interface Page {
  id: ID;
  title: string;
  icon?: string;
  cover?: string;
  parentId: ID | null;
  /** if this page is a row of a database, the database page id */
  dbId?: ID;
  props?: Record<ID, PropValue>;
  blocks: Block[];
  /** when set, this page *is* a database */
  database?: Database;
  /** inline databases are rendered inside their parent page */
  inline?: boolean;
  favorite?: boolean;
  trashed?: boolean;
  fullWidth?: boolean;
  smallText?: boolean;
  font?: "sans" | "serif" | "mono";
  locked?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  accent: string;
  sidebarWidth: number;
  sidebarOpen: boolean;
  userName: string;
}

export interface Workspace {
  version: 1;
  name: string;
  pages: Record<ID, Page>;
  /** root order of top-level pages */
  rootOrder: ID[];
  /** child order per parent page */
  childOrder: Record<ID, ID[]>;
  settings: Settings;
}
