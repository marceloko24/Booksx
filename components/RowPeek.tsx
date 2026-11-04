"use client";

import { useEffect } from "react";
import { ChevronsRight, Maximize2, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageBody } from "./PageView";

export function RowPeek() {
  const peekId = useStore((s) => s.peekRowId);
  const exists = useStore((s) => (s.peekRowId ? !!s.ws.pages[s.peekRowId] && !s.ws.pages[s.peekRowId].trashed : false));
  const st = useStore.getState;

  useEffect(() => {
    if (!peekId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".popover")) st().setPeek(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [peekId, st]);

  if (!peekId || !exists) return null;
  return (
    <>
      <div className="peek-backdrop" onClick={() => st().setPeek(null)} />
      <aside className="peek" aria-label="Vista previa del elemento">
        <div className="peek-bar">
          <button className="icon-btn" aria-label="Cerrar" onClick={() => st().setPeek(null)}>
            <ChevronsRight size={18} />
          </button>
          <button className="btn ghost sm" onClick={() => st().navigate(peekId)}>
            <Maximize2 size={14} /> Abrir como página
          </button>
          <span className="grow" />
          <button
            className="icon-btn"
            aria-label="Eliminar"
            onClick={() => {
              st().trashPage(peekId);
              st().setPeek(null);
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="peek-scroll">
          <PageBody pageId={peekId} peek />
        </div>
      </aside>
    </>
  );
}
