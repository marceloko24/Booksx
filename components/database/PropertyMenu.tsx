"use client";

import { useState } from "react";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, EyeOff, Filter as FilterIcon, Trash2, ChevronLeft } from "lucide-react";
import type { ID, Property, PropertyType, RollupFn, View } from "@/lib/types";
import { defaultStatusOptions, pageTitle, useStore } from "@/lib/store";
import { PROPERTY_TYPE_LABEL, propIcon, OPS_BY_TYPE } from "@/lib/query";
import { uid } from "@/lib/utils";
import { useUI } from "@/lib/ui";
import { MenuItem, MenuSeparator, MenuTitle, Popover, type Anchor } from "../ui/Popover";

const TYPES: PropertyType[] = [
  "text", "number", "select", "multi_select", "status", "date", "person", "checkbox",
  "url", "email", "relation", "rollup", "formula", "created_time",
];

const ROLLUP_FNS: Array<[RollupFn, string]> = [
  ["count", "Contar todos"],
  ["count_values", "Contar valores"],
  ["sum", "Suma"],
  ["avg", "Promedio"],
  ["min", "Mínimo"],
  ["max", "Máximo"],
  ["percent_checked", "% marcadas"],
  ["percent_done", "% completado (estado)"],
  ["show", "Mostrar originales"],
];

export function PropertyMenu({
  dbId,
  propId,
  view,
  anchor,
  onClose,
  isNew,
}: {
  dbId: ID;
  propId: ID;
  view?: View;
  anchor: Anchor;
  onClose: () => void;
  isNew?: boolean;
}) {
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const db = ws.pages[dbId]?.database;
  const prop = db?.properties.find((p) => p.id === propId);
  const [mode, setMode] = useState<"main" | "type">(isNew ? "type" : "main");
  if (!db || !prop) return null;

  const update = (patch: Partial<Property>) => st().updateProperty(dbId, propId, patch);

  const changeType = (type: PropertyType) => {
    const patch: Partial<Property> = { type };
    if ((type === "select" || type === "multi_select") && !prop.options?.length) patch.options = [];
    if (type === "status" && !prop.options?.some((o) => o.group)) patch.options = defaultStatusOptions();
    if (type === "status" && prop.options?.length && !prop.options.some((o) => o.group))
      patch.options = prop.options.map((o) => ({ ...o, group: "todo" }));
    if (type === "relation") {
      // relations are created with a reciprocal property; replace the property
      const otherDbs = Object.values(ws.pages).filter((p) => p.database && !p.trashed);
      const target = otherDbs.find((p) => p.id !== dbId) ?? otherDbs[0];
      st().deleteProperty(dbId, propId);
      st().addProperty(dbId, { name: prop.name === "Propiedad" || isNew ? "Relación" : prop.name, type: "relation", targetDbId: target?.id });
      onClose();
      return;
    }
    if (type === "rollup") {
      const rel = db.properties.find((p) => p.type === "relation");
      patch.relationPropId = rel?.id;
      patch.rollupFn = "count";
    }
    if (type === "formula" && !prop.expression) patch.expression = 'concat(prop("Nombre"), "")';
    update(patch);
    setMode("main");
  };

  const relationProps = db.properties.filter((p) => p.type === "relation");
  const rollupRel = relationProps.find((p) => p.id === prop.relationPropId);
  const rollupTargetDb = rollupRel?.targetDbId ? ws.pages[rollupRel.targetDbId]?.database : undefined;

  const viewUpdate = (patch: Partial<View>) => view && st().updateView(dbId, view.id, patch);

  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      {mode === "type" ? (
        <>
          <div className="row">
            {!isNew && (
              <button className="icon-btn xs" onClick={() => setMode("main")} aria-label="Volver">
                <ChevronLeft size={15} />
              </button>
            )}
            <MenuTitle>Tipo de propiedad</MenuTitle>
          </div>
          {TYPES.map((t) => (
            <MenuItem key={t} icon={<span className="prop-icon">{propIcon(t)}</span>} label={PROPERTY_TYPE_LABEL[t]} active={prop.type === t} onClick={() => changeType(t)} />
          ))}
        </>
      ) : (
        <div className="pad-sm">
          <input
            className="input"
            autoFocus
            value={prop.name}
            onChange={(e) => update({ name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onClose()}
            aria-label="Nombre de la propiedad"
          />
          {prop.type !== "title" && (
            <MenuItem
              icon={<span className="prop-icon">{propIcon(prop.type)}</span>}
              label="Tipo"
              hint={PROPERTY_TYPE_LABEL[prop.type]}
              onClick={() => setMode("type")}
            />
          )}

          {prop.type === "number" && (
            <label className="field">
              <span>Formato</span>
              <select className="input" value={prop.numberFormat ?? "plain"} onChange={(e) => update({ numberFormat: e.target.value as Property["numberFormat"] })}>
                <option value="plain">Número</option>
                <option value="percent">Porcentaje</option>
                <option value="currency">Moneda (USD)</option>
              </select>
            </label>
          )}

          {prop.type === "relation" && (
            <label className="field">
              <span>Relacionada con</span>
              <select
                className="input"
                value={prop.targetDbId ?? ""}
                onChange={(e) => {
                  // recreate with new target so the reciprocal side is correct
                  const name = prop.name;
                  st().deleteProperty(dbId, propId);
                  st().addProperty(dbId, { name, type: "relation", targetDbId: e.target.value });
                  onClose();
                }}
              >
                {Object.values(ws.pages)
                  .filter((p) => p.database && !p.trashed)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === dbId ? `${pageTitle(p)} (esta base)` : pageTitle(p)}
                    </option>
                  ))}
              </select>
              <small className="muted">Se crea la propiedad inversa en la otra base automáticamente.</small>
            </label>
          )}

          {prop.type === "rollup" && (
            <>
              <label className="field">
                <span>Relación</span>
                <select className="input" value={prop.relationPropId ?? ""} onChange={(e) => update({ relationPropId: e.target.value, targetPropId: undefined })}>
                  <option value="">Elige una relación…</option>
                  {relationProps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              {rollupTargetDb && (
                <label className="field">
                  <span>Propiedad</span>
                  <select className="input" value={prop.targetPropId ?? "title"} onChange={(e) => update({ targetPropId: e.target.value })}>
                    {rollupTargetDb.properties.filter((p) => p.type !== "rollup").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Calcular</span>
                <select className="input" value={prop.rollupFn ?? "count"} onChange={(e) => update({ rollupFn: e.target.value as RollupFn })}>
                  {ROLLUP_FNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              {!relationProps.length && <small className="muted">Primero crea una propiedad de relación.</small>}
            </>
          )}

          {prop.type === "formula" && (
            <label className="field">
              <span>Fórmula</span>
              <textarea
                className="input mono"
                rows={3}
                value={prop.expression ?? ""}
                onChange={(e) => update({ expression: e.target.value })}
              />
              <small className="muted">
                Ej.: <code>prop(&quot;Horas&quot;) * 25</code>, <code>if(prop(&quot;Hecha&quot;), &quot;✅&quot;, &quot;⏳&quot;)</code>,{" "}
                <code>dateBetween(prop(&quot;Fecha&quot;), today())</code>
              </small>
            </label>
          )}

          {view && (
            <>
              <MenuSeparator />
              <MenuItem icon={<ArrowUpNarrowWide size={15} />} label="Orden ascendente" onClick={() => { viewUpdate({ sorts: [{ id: uid(), propId, dir: "asc" }] }); onClose(); }} />
              <MenuItem icon={<ArrowDownNarrowWide size={15} />} label="Orden descendente" onClick={() => { viewUpdate({ sorts: [{ id: uid(), propId, dir: "desc" }] }); onClose(); }} />
              <MenuItem
                icon={<FilterIcon size={15} />}
                label="Filtrar"
                onClick={() => {
                  viewUpdate({ filters: [...view.filters, { id: uid(), propId, op: OPS_BY_TYPE[prop.type][0] }] });
                  onClose();
                }}
              />
              {prop.type !== "title" && (
                <MenuItem
                  icon={<EyeOff size={15} />}
                  label="Ocultar en esta vista"
                  onClick={() => {
                    const visible = view.visibleProps ?? db.properties.map((p) => p.id);
                    viewUpdate({ visibleProps: visible.filter((x) => x !== propId) });
                    onClose();
                  }}
                />
              )}
            </>
          )}
          {prop.type !== "title" && (
            <>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 size={15} />}
                label="Eliminar propiedad"
                onClick={() => {
                  onClose();
                  useUI.getState().ask(`Se eliminará la propiedad «${prop.name}» y sus valores.`, () => st().deleteProperty(dbId, propId));
                }}
              />
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
