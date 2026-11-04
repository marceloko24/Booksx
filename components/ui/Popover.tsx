"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface Anchor {
  x: number;
  y: number;
  /** height of the anchor; popover flips above when there is no room below */
  h?: number;
}

export function anchorFrom(el: Element | null | undefined): Anchor {
  if (!el) return { x: 100, y: 100 };
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4, h: r.height + 8 };
}

interface Props {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
}

export function Popover({ anchor, onClose, children, width = 260, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.x, top: anchor.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    let left = Math.min(Math.max(8, anchor.x), vw - w - 8);
    let top = anchor.y;
    const h = el.offsetHeight;
    if (top + h > vh - 8) {
      const above = anchor.y - (anchor.h ?? 0) - h;
      top = above > 8 ? above : Math.max(8, vh - h - 8);
    }
    if (vw < 480) left = 8;
    setPos({ left, top });
  }, [anchor.x, anchor.y, anchor.h, width]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // defer so the opening click does not close it
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("touchstart", onDown);
    }, 0);
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className ?? ""}`}
      style={{ left: pos.left, top: pos.top, width: Math.min(width, typeof window !== "undefined" ? window.innerWidth - 16 : width) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  danger,
  active,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button type="button" className={`menu-item${danger ? " danger" : ""}${active ? " active" : ""}`} onClick={onClick}>
      {icon !== undefined && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{label}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-sep" />;
}

export function MenuTitle({ children }: { children: ReactNode }) {
  return <div className="menu-title">{children}</div>;
}

export function Modal({
  onClose,
  children,
  width = 640,
  className,
}: {
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${className ?? ""}`} style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
