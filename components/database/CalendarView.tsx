"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Database, DateValue, ID, Page, View } from "@/lib/types";
import { pageTitle, useStore } from "@/lib/store";
import { computeValue, findOption } from "@/lib/query";
import { addDays, cx, diffDays, MONTHS_LONG, parseISODate, toISODate, todayISO, WEEKDAYS } from "@/lib/utils";

function dateOf(ws: ReturnType<typeof useStore.getState>["ws"], row: Page, db: Database, propId: ID): DateValue | null {
  const prop = db.properties.find((p) => p.id === propId);
  if (!prop) return null;
  const v = computeValue(ws, row, prop, db);
  if (!v) return null;
  if (typeof v === "string") return { start: v };
  return v as DateValue;
}

export function CalendarView({ dbId, db, view, rows, onNew }: { dbId: ID; db: Database; view: View; rows: Page[]; onNew: (p?: Record<ID, unknown>) => ID }) {
  const ws = useStore((s) => s.ws);
  const st = useStore.getState;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [drag, setDrag] = useState<ID | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const dateProp = db.properties.find((p) => p.id === view.dateProp && (p.type === "date" || p.type === "created_time"));
  const statusProp = db.properties.find((p) => p.type === "status");

  const days = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7; // monday first
    const start = toISODate(new Date(first.getFullYear(), first.getMonth(), 1 - offset));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Page[]>();
    if (!dateProp) return map;
    for (const r of rows) {
      const d = dateOf(ws, r, db, dateProp.id);
      if (!d) continue;
      const end = d.end && d.end > d.start ? d.end : d.start;
      const span = Math.min(diffDays(d.start, end), 62);
      for (let i = 0; i <= span; i++) {
        const k = addDays(d.start, i);
        map.set(k, [...(map.get(k) ?? []), r]);
      }
    }
    return map;
  }, [rows, ws, db, dateProp]);

  if (!dateProp) {
    const candidates = db.properties.filter((p) => p.type === "date");
    return (
      <div className="empty-state">
        <p>El calendario necesita una propiedad de fecha.</p>
        <div className="row gap-sm wrap center">
          {candidates.map((p) => (
            <button key={p.id} className="btn ghost sm" onClick={() => st().updateView(dbId, view.id, { dateProp: p.id })}>{p.name}</button>
          ))}
          {!candidates.length && (
            <button className="btn primary sm" onClick={() => {
              const id = st().addProperty(dbId, { name: "Fecha", type: "date" });
              st().updateView(dbId, view.id, { dateProp: id });
            }}>Crear propiedad Fecha</button>
          )}
        </div>
      </div>
    );
  }

  const today = todayISO();
  const month = cursor.getMonth();
  const editable = dateProp.type === "date";

  const moveTo = (rowId: ID, day: string) => {
    const r = ws.pages[rowId];
    const d = dateOf(ws, r, db, dateProp.id);
    if (!d) {
      st().setRowProp(rowId, dateProp.id, { start: day });
      return;
    }
    const delta = diffDays(d.start, day);
    st().setRowProp(rowId, dateProp.id, { start: day, end: d.end ? addDays(d.end, delta) : undefined });
  };

  const undated = rows.filter((r) => !dateOf(ws, r, db, dateProp.id));

  return (
    <div className="calendar">
      <div className="cal-head">
        <h3>{MONTHS_LONG[month]} {cursor.getFullYear()}</h3>
        <div className="row gap-sm">
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), month - 1, 1))}><ChevronLeft size={16} /></button>
          <button className="btn ghost sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoy</button>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => setCursor(new Date(cursor.getFullYear(), month + 1, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((d) => <div key={d} className="cal-wd">{d}</div>)}
        {days.map((day) => {
          const items = byDay.get(day) ?? [];
          const inMonth = parseISODate(day).getMonth() === month;
          return (
            <div
              key={day}
              className={cx("cal-day", !inMonth && "out", day === today && "today", overDay === day && "drop")}
              onDragOver={(e) => {
                if (!drag || !editable) return;
                e.preventDefault();
                setOverDay(day);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) moveTo(drag, day);
                setDrag(null);
                setOverDay(null);
              }}
            >
              <div className="cal-day-head">
                <span className="cal-num">{parseISODate(day).getDate()}</span>
                {editable && (
                  <button className="icon-btn xs cal-add" aria-label="Nuevo en este día" onClick={() => onNew({ [dateProp.id]: { start: day } })}>
                    <Plus size={13} />
                  </button>
                )}
              </div>
              {items.slice(0, 4).map((r) => {
                const st0 = statusProp ? findOption(statusProp, r.props?.[statusProp.id]) : undefined;
                return (
                  <div
                    key={r.id}
                    className={cx("cal-item", st0 && `tag-${st0.color}`, st0?.group === "done" && "done")}
                    draggable={editable}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDrag(r.id);
                    }}
                    onDragEnd={() => { setDrag(null); setOverDay(null); }}
                    onClick={() => useStore.getState().setPeek(r.id)}
                    title={pageTitle(r)}
                  >
                    {r.icon && `${r.icon} `}{pageTitle(r)}
                  </div>
                );
              })}
              {items.length > 4 && <div className="cal-more">+{items.length - 4} más</div>}
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <div className="undated">
          <span className="muted small">Sin fecha ({undated.length}) — arrástralos a un día:</span>
          {undated.slice(0, 12).map((r) => (
            <span
              key={r.id}
              className="chip"
              draggable={editable}
              onDragStart={() => setDrag(r.id)}
              onClick={() => useStore.getState().setPeek(r.id)}
            >
              {pageTitle(r)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
