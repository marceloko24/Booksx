"use client";

import { useState } from "react";
import { Popover, type Anchor } from "./Popover";

const GROUPS: Record<string, string[]> = {
  Frecuentes: ["📄", "📝", "📚", "📘", "🚀", "✅", "☑️", "📁", "🗂️", "📅", "🗓️", "💡", "⭐", "🔥", "🎯", "📌"],
  Trabajo: ["💼", "📊", "📈", "🧾", "🤝", "🏢", "🧠", "🛠️", "⚙️", "🔧", "🧪", "💻", "🖥️", "📱", "✉️", "📣"],
  Personal: ["🏠", "🍳", "🏋️", "🧘", "✈️", "🎵", "🎨", "📷", "🎮", "🌱", "🐶", "☕", "🍎", "💰", "❤️", "😊"],
  Símbolos: ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "✨", "⚡", "🌙", "☀️", "❓", "❗", "🔒", "🔑"],
};

export function EmojiPicker({
  anchor,
  onPick,
  onClose,
  allowRemove = true,
}: {
  anchor: Anchor;
  onPick: (emoji: string | undefined) => void;
  onClose: () => void;
  allowRemove?: boolean;
}) {
  const [custom, setCustom] = useState("");
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className="emoji-picker">
        <div className="emoji-top">
          <input
            className="input"
            placeholder="Pega un emoji…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                onPick([...custom.trim()][0]);
                onClose();
              }
            }}
          />
          {allowRemove && (
            <button className="btn ghost sm" onClick={() => { onPick(undefined); onClose(); }}>
              Quitar
            </button>
          )}
        </div>
        {Object.entries(GROUPS).map(([g, list]) => (
          <div key={g}>
            <div className="menu-title">{g}</div>
            <div className="emoji-grid">
              {list.map((e) => (
                <button key={e} className="emoji-btn" onClick={() => { onPick(e); onClose(); }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}

export const COVERS = [
  "linear-gradient(120deg,#4f46e5,#06b6d4)",
  "linear-gradient(120deg,#6366f1,#22d3ee)",
  "linear-gradient(120deg,#f97316,#facc15)",
  "linear-gradient(120deg,#ec4899,#8b5cf6)",
  "linear-gradient(120deg,#10b981,#84cc16)",
  "linear-gradient(120deg,#0f172a,#334155)",
  "linear-gradient(120deg,#fde68a,#fca5a5)",
  "linear-gradient(120deg,#a5b4fc,#f0abfc)",
  "#e7e5e4",
  "#dbeafe",
];
