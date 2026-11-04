"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { TEMPLATES } from "@/lib/templates";
import { pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { cx } from "@/lib/utils";
import { Modal } from "./ui/Popover";

const CATS = ["Todas", "Personal", "Trabajo", "Proyectos", "Conocimiento"] as const;

export function TemplatesModal() {
  const ui = useUI();
  const parentId = ui.templatesFor?.parentId ?? null;
  const parent = useStore((s) => (parentId ? s.ws.pages[parentId] : undefined));
  const [cat, setCat] = useState<(typeof CATS)[number]>("Todas");
  const list = TEMPLATES.filter((t) => cat === "Todas" || t.category === cat);

  return (
    <Modal onClose={ui.closeTemplates} width={820} className="templates-modal">
      <div className="modal-head">
        <div>
          <h2>Plantillas</h2>
          <p className="muted small">{parent ? `Se añadirá dentro de «${pageTitle(parent)}».` : "Se creará como página nueva en la raíz."}</p>
        </div>
        <button className="icon-btn" aria-label="Cerrar" onClick={ui.closeTemplates}><X size={18} /></button>
      </div>
      <div className="seg wrap">
        {CATS.map((c) => (
          <button key={c} className={cx(cat === c && "on")} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="tpl-grid">
        {list.map((t) => (
          <button
            key={t.id}
            className="tpl-card"
            onClick={() => {
              const id = t.create(parentId);
              ui.closeTemplates();
              useStore.getState().navigate(id);
              ui.showToast(`Plantilla «${t.name}» creada`);
            }}
          >
            <span className="tpl-icon">{t.icon}</span>
            <span className="tpl-name">{t.name}</span>
            <span className="tpl-desc muted small">{t.description}</span>
            <span className="tpl-cat">{t.category}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
