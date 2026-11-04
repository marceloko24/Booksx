"use client";

import type { Workspace } from "./types";

/**
 * Local-first persistence. Every change is debounced and written to
 * localStorage; swap `writeRemote` for a real backend later without touching
 * the UI (the save indicator listens to the same events).
 */

const KEY = "booksx:workspace:v1";
const DELAY = 400;

type Listener = (state: "saving" | "saved" | "error", at?: number) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Workspace | null = null;

export function onSaveState(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(state: "saving" | "saved" | "error", at?: number) {
  for (const l of listeners) l(state, at);
}

export function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const ws = JSON.parse(raw) as Workspace;
    if (ws?.version !== 1 || typeof ws.pages !== "object") return null;
    return ws;
  } catch {
    return null;
  }
}

export function scheduleSave(ws: Workspace) {
  pending = ws;
  emit("saving");
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushSave, DELAY);
}

export function flushSave() {
  if (!pending) return;
  const ws = pending;
  pending = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
    emit("saved", Date.now());
  } catch {
    emit("error");
  }
}

export function hasPendingSave() {
  return pending !== null;
}

export function exportWorkspace(ws: Workspace) {
  const blob = new Blob([JSON.stringify(ws, null, 2)], { type: "application/json" });
  downloadBlob(blob, `booksx-${new Date().toISOString().slice(0, 10)}.json`);
}

/** true in the static demo build (no server, downloads blocked by the host) */
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

export function downloadBlob(blob: Blob, name: string) {
  if (STATIC_DEMO) {
    void blob.text().then((t) =>
      navigator.clipboard
        ?.writeText(t)
        .then(() => window.dispatchEvent(new CustomEvent("booksx:toast", { detail: `«${name}» copiado al portapapeles` })))
        .catch(() => window.dispatchEvent(new CustomEvent("booksx:toast", { detail: "No se pudo copiar al portapapeles" }))),
    );
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readWorkspaceFile(file: File): Promise<Workspace> {
  const text = await file.text();
  const ws = JSON.parse(text) as Workspace;
  if (ws?.version !== 1 || typeof ws.pages !== "object" || !Array.isArray(ws.rootOrder)) {
    throw new Error("El archivo no es un espacio de BOOKSX válido.");
  }
  return ws;
}
