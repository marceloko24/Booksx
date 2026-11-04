"use client";

import { useState } from "react";
import { RotateCcw, Trash2, X, FileText } from "lucide-react";
import { pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { formatRelative } from "@/lib/utils";
import { Modal } from "./ui/Popover";

export function TrashModal() {
  const ui = useUI();
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const [q, setQ] = useState("");
  // show only the top-most trashed item of each trashed subtree
  const trashed = Object.values(ws.pages)
    .filter((p) => p.trashed)
    .filter((p) => {
      const parent = p.parentId ? ws.pages[p.parentId] : undefined;
      return !parent || !parent.trashed;
    })
    .filter((p) => pageTitle(p).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <Modal onClose={() => ui.openTrash(false)} width={560}>
      <div className="modal-head">
        <h2>Papelera</h2>
        <button className="icon-btn" aria-label="Cerrar" onClick={() => ui.openTrash(false)}><X size={18} /></button>
      </div>
      <input className="input" placeholder="Filtrar por título…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="trash-list">
        {trashed.length === 0 && <div className="empty-state small">La papelera está vacía.</div>}
        {trashed.map((p) => (
          <div key={p.id} className="trash-item">
            <span className="menu-icon">{p.icon || <FileText size={15} />}</span>
            <span className="grow">
              {pageTitle(p)}
              {p.dbId && <span className="muted small"> · en {pageTitle(ws.pages[p.dbId])}</span>}
              <span className="menu-sub">{formatRelative(p.updatedAt)}</span>
            </span>
            <button className="icon-btn" aria-label="Restaurar" title="Restaurar" onClick={() => st().restorePage(p.id)}>
              <RotateCcw size={15} />
            </button>
            <button
              className="icon-btn danger"
              aria-label="Eliminar para siempre"
              title="Eliminar para siempre"
              onClick={() => ui.ask(`«${pageTitle(p)}» se eliminará para siempre.`, () => st().deleteForever(p.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      {trashed.length > 0 && (
        <div className="row end mt">
          <button className="btn ghost sm danger" onClick={() => ui.ask("Se vaciará la papelera. No se puede deshacer.", () => st().emptyTrash(), "Vaciar")}>
            Vaciar papelera
          </button>
        </div>
      )}
    </Modal>
  );
}
