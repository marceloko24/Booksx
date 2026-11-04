"use client";

import { useMemo, useRef, useState } from "react";
import type { Database, DateValue, ID, Page, View } from "@/lib/types";
import { pageTitle, useStore } from "@/lib/store";
import { computeValue, findOption } from "@/lib/query";
import { addDays, cx, diffDays, parseISODate, todayISO, MONTHS_LONG } from "@/lib/utils";

export function TimelineView({ dbId, db, view, rows, onNew }: { dbId: ID; db: Database; view: View; rows: Page[]; onNew: (p?: Record<ID, unknown>) => ID }) {
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const dateProp = db.properties.find((p) => p.id === view.dateProp && p.type === "date");
  const statusProp = db.properties.find((p) => p.type === "status");
  const scale = view.timelineScale ?? "day";
  const dayW = scale === "day" ? 36 : 14;
  const [dragState, setDragState] = useState<{ id: ID; mode: "move" | "end" | "start"; delta: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    if (!dateProp) return [];
    return rows.map((r) => {
      const v = computeValue(ws, r, dateProp, db) as DateValue | null | undefined;
      return { row: r, start: v?.start, end: v?.end && v.end >= v.start ? v.end : v?.start };
    });
  }, [rows, ws, db, dateProp]);

  const range = useMemo(() => {
    const today = todayISO();
    let min = addDays(today, -7);
    let max = addDays(today, 30);
    for (const it of items) {
      if (it.start && it.start < min) min = addDays(it.start, -3);
      if (it.end && it.end > max) max = addDays(it.end, 7);
    }
    // start on monday
    const d = parseISODate(min);
    min = addDays(min, -((d.getDay() + 6) % 7));
    return { min, days: diffDays(min, max) + 1 };
  }, [items]);

  if (!dateProp) {
    const candidates = db.properties.filter((p) => p.type === "date");
    return (
      <div className="empty-state">
        <p>El cronograma necesita una propiedad de fecha (con fecha de fin para ver barras).</p>
        <div className="row gap-sm wrap center">
          {candidates.map((p) => (
            <button key={p.id} className="btn ghost sm" onClick={() => st().updateView(dbId, view.id, { dateProp: p.id })}>{p.name}</button>
          ))}
          {!candidates.length && (
            <button className="btn primary sm" onClick={() => {
              const id = st().addProperty(dbId, { name: "Fechas", type: "date" });
              st().updateView(dbId, view.id, { dateProp: id });
            }}>Crear propiedad de fecha</button>
          )}
        </div>
      </div>
    );
  }

  const today = todayISO();
  const todayX = diffDays(range.min, today) * dayW;

  const beginDrag = (e: React.PointerEvent, it: (typeof items)[number], mode: "move" | "end" | "start") => {
    if (!it.start) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let delta = 0;
    setDragState({ id: it.row.id, mode, delta: 0 });
    const move = (ev: PointerEvent) => {
      delta = Math.round((ev.clientX - startX) / dayW);
      setDragState({ id: it.row.id, mode, delta });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragState(null);
      if (delta === 0) {
        if (mode === "move") st().setPeek(it.row.id);
        return;
      }
      const s = it.start!;
      const en = it.end ?? s;
      let ns = s;
      let ne = en;
      if (mode === "move") { ns = addDays(s, delta); ne = addDays(en, delta); }
      if (mode === "end") { ne = addDays(en, delta); if (ne < s) ne = s; }
      if (mode === "start") { ns = addDays(s, delta); if (ns > en) ns = en; }
      st().setRowProp(it.row.id, dateProp.id, { start: ns, end: ne !== ns ? ne : undefined });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // header: months + days
  const dayCells = Array.from({ length: range.days }, (_, i) => addDays(range.min, i));
  const months: { label: string; span: number }[] = [];
  for (const d of dayCells) {
    const dt = parseISODate(d);
    const label = `${MONTHS_LONG[dt.getMonth()]} ${dt.getFullYear()}`;
    if (months.length && months[months.length - 1].label === label) months[months.length - 1].span++;
    else months.push({ label, span: 1 });
  }

  return (
    <div className="timeline">
      <div className="tl-controls">
        <div className="seg">
          <button className={cx(scale === "day" && "on")} onClick={() => st().updateView(dbId, view.id, { timelineScale: "day" })}>Días</button>
          <button className={cx(scale === "week" && "on")} onClick={() => st().updateView(dbId, view.id, { timelineScale: "week" })}>Semanas</button>
        </div>
        <button className="btn ghost sm" onClick={() => scrollRef.current?.scrollTo({ left: Math.max(0, todayX - 200), behavior: "smooth" })}>Hoy</button>
      </div>
      <div className="tl-wrap">
        <div className="tl-left">
          <div className="tl-left-head">Nombre</div>
          {items.map((it) => (
            <div key={it.row.id} className="tl-left-row" onClick={() => st().setPeek(it.row.id)}>
              {it.row.icon && `${it.row.icon} `}{pageTitle(it.row)}
            </div>
          ))}
          <div className="tl-left-row add-row" onClick={() => onNew({ [dateProp.id]: { start: today, end: addDays(today, 3) } })}>+ Nuevo</div>
        </div>
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-canvas" style={{ width: range.days * dayW }}>
            <div className="tl-months">
              {months.map((m, i) => (
                <div key={i} style={{ width: m.span * dayW }} className="tl-month">{m.span * dayW > 70 ? m.label : ""}</div>
              ))}
            </div>
            <div className="tl-days">
              {dayCells.map((d) => {
                const dt = parseISODate(d);
                const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                return (
                  <div key={d} className={cx("tl-day", weekend && "weekend", d === today && "today")} style={{ width: dayW }}>
                    {scale === "day" ? dt.getDate() : dt.getDay() === 1 ? dt.getDate() : ""}
                  </div>
                );
              })}
            </div>
            <div className="tl-today" style={{ left: todayX + dayW / 2 }} />
            {items.map((it) => {
              const ds = dragState?.id === it.row.id ? dragState : null;
              const opt = statusProp ? findOption(statusProp, it.row.props?.[statusProp.id]) : undefined;
              if (!it.start) {
                return (
                  <div key={it.row.id} className="tl-row">
                    <button className="tl-set-date" onClick={() => st().setRowProp(it.row.id, dateProp.id, { start: today, end: addDays(today, 2) })}>
                      Sin fecha · asignar
                    </button>
                  </div>
                );
              }
              let s = diffDays(range.min, it.start);
              let e = diffDays(range.min, it.end ?? it.start);
              if (ds?.mode === "move") { s += ds.delta; e += ds.delta; }
              if (ds?.mode === "end") e = Math.max(s, e + ds.delta);
              if (ds?.mode === "start") s = Math.min(e, s + ds.delta);
              return (
                <div key={it.row.id} className="tl-row">
                  <div
                    className={cx("tl-bar", opt && `tag-${opt.color}`, ds && "dragging")}
                    style={{ left: s * dayW + 2, width: (e - s + 1) * dayW - 4 }}
                    onPointerDown={(ev) => beginDrag(ev, it, "move")}
                    title={pageTitle(it.row)}
                  >
                    <span className="tl-handle left" onPointerDown={(ev) => beginDrag(ev, it, "start")} />
                    <span className="tl-bar-label">{pageTitle(it.row)}</span>
                    <span className="tl-handle right" onPointerDown={(ev) => beginDrag(ev, it, "end")} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
