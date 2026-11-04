"use client";

import { useMemo, useState } from "react";
import { FileText, Database as DbIcon } from "lucide-react";
import { getBreadcrumb, pageTitle, useStore } from "@/lib/store";
import type { ID } from "@/lib/types";
import { Popover, type Anchor } from "./ui/Popover";
import { cx } from "@/lib/utils";

/** Search-as-you-type list of pages, used for links and relations. */
export function PagePicker({
  anchor,
  onPick,
  onClose,
  excludeId,
  onlyDb,
  includeRows = true,
  title = "Enlazar a una página",
}: {
  anchor: Anchor;
  onPick: (id: ID) => void;
  onClose: () => void;
  excludeId?: ID;
  /** restrict to rows of this database */
  onlyDb?: ID;
  includeRows?: boolean;
  title?: string;
}) {
  const ws = useStore((s) => s.ws);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const results = useMemo(() => {
    const query = q.toLowerCase();
    return Object.values(ws.pages)
      .filter((p) => !p.trashed && p.id !== excludeId)
      .filter((p) => (onlyDb ? p.dbId === onlyDb : includeRows || !p.dbId))
      .filter((p) => pageTitle(p).toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 30);
  }, [ws.pages, q, excludeId, onlyDb, includeRows]);

  return (
    <Popover anchor={anchor} onClose={onClose} width={320}>
      <div className="menu-title">{title}</div>
      <input
        autoFocus
        className="input"
        placeholder="Buscar…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter" && results[idx]) onPick(results[idx].id);
        }}
      />
      <div className="picker-list">
        {results.length === 0 && <div className="menu-empty">Sin resultados</div>}
        {results.map((p, i) => {
          const crumb = getBreadcrumb(ws, p.id).slice(0, -1).map(pageTitle).join(" / ");
          return (
            <button key={p.id} className={cx("menu-item", i === idx && "active")} onClick={() => onPick(p.id)} onMouseEnter={() => setIdx(i)}>
              <span className="menu-icon">{p.icon || (p.database ? <DbIcon size={15} /> : <FileText size={15} />)}</span>
              <span className="menu-label">
                {pageTitle(p)}
                {crumb && <span className="menu-sub">{crumb}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
