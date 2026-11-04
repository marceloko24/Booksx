"use client";

import { useRef } from "react";
import { Download, Upload, X, Monitor, Moon, Sun } from "lucide-react";
import { emptyWorkspace, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { exportWorkspace, readWorkspaceFile } from "@/lib/persistence";
import { seedWorkspace } from "@/lib/templates";
import { cx } from "@/lib/utils";
import { Modal } from "./ui/Popover";

const ACCENTS = ["#4f46e5", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#334155"];

export function SettingsModal() {
  const ui = useUI();
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const fileRef = useRef<HTMLInputElement>(null);
  const s = ws.settings;
  const counts = Object.values(ws.pages).reduce(
    (acc, p) => {
      if (p.trashed) acc.trash++;
      else if (p.database) acc.dbs++;
      else if (p.dbId) acc.rows++;
      else acc.pages++;
      return acc;
    },
    { pages: 0, dbs: 0, rows: 0, trash: 0 },
  );
  const size = new Blob([JSON.stringify(ws)]).size;

  return (
    <Modal onClose={() => ui.openSettings(false)} width={560}>
      <div className="modal-head">
        <h2>Ajustes</h2>
        <button className="icon-btn" aria-label="Cerrar" onClick={() => ui.openSettings(false)}><X size={18} /></button>
      </div>

      <section className="settings-sec">
        <h3>Espacio de trabajo</h3>
        <label className="field">
          <span>Nombre del espacio</span>
          <input className="input" value={ws.name} onChange={(e) => st().renameWorkspace(e.target.value)} />
        </label>
        <label className="field">
          <span>Tu nombre (para responsables)</span>
          <input className="input" value={s.userName} onChange={(e) => st().updateSettings({ userName: e.target.value })} />
        </label>
      </section>

      <section className="settings-sec">
        <h3>Apariencia</h3>
        <div className="seg">
          {([
            ["light", "Claro", <Sun key="s" size={14} />],
            ["dark", "Oscuro", <Moon key="m" size={14} />],
            ["system", "Sistema", <Monitor key="c" size={14} />],
          ] as const).map(([v, label, icon]) => (
            <button key={v} className={cx(s.theme === v && "on")} onClick={() => st().updateSettings({ theme: v })}>
              {icon} {label}
            </button>
          ))}
        </div>
        <div className="field">
          <span>Color de acento</span>
          <div className="accent-row">
            {ACCENTS.map((c) => (
              <button key={c} className={cx("accent-dot", s.accent === c && "on")} style={{ background: c }} aria-label={`Acento ${c}`} onClick={() => st().updateSettings({ accent: c })} />
            ))}
          </div>
        </div>
      </section>

      <section className="settings-sec">
        <h3>Datos</h3>
        <p className="muted small">
          {counts.pages} páginas · {counts.dbs} bases de datos · {counts.rows} elementos · {counts.trash} en la papelera · {(size / 1024).toFixed(0)} KB.
          Se guarda automáticamente en este navegador.
        </p>
        <div className="row gap-sm wrap">
          <button className="btn ghost sm" onClick={() => exportWorkspace(ws)}><Download size={14} /> Exportar copia (JSON)</button>
          <button className="btn ghost sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Importar copia</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const imported = await readWorkspaceFile(f);
                ui.ask("Esto reemplazará tu espacio actual por la copia importada.", () => {
                  st().replaceWorkspace(imported);
                  ui.showToast("Copia importada");
                }, "Importar");
              } catch (err) {
                ui.showToast((err as Error).message);
              }
              e.target.value = "";
            }}
          />
          <button
            className="btn ghost sm danger"
            onClick={() => {
              ui.ask("Se borrará todo y volverás al espacio de ejemplo. Exporta una copia antes si la necesitas.", () => {
                st().replaceWorkspace(emptyWorkspace());
                seedWorkspace();
                ui.openSettings(false);
              }, "Restablecer");
            }}
          >
            Restablecer espacio
          </button>
        </div>
      </section>
    </Modal>
  );
}
