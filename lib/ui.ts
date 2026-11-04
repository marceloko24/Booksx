"use client";

import { create } from "zustand";
import type { ID } from "./types";

export interface AIRequest {
  /** text selected or block content to work on */
  text?: string;
  /** page used as context */
  pageId?: ID | null;
  /** when set, results can be inserted after this block */
  blockId?: ID;
  action?: string;
}

interface UIState {
  searchOpen: boolean;
  templatesFor: { parentId: ID | null } | null;
  settingsOpen: boolean;
  trashOpen: boolean;
  ai: AIRequest | null;
  mobileSidebar: boolean;
  toast: { id: number; text: string } | null;
  confirmReq: { text: string; yes: string; onYes: () => void } | null;
  /** in-app confirmation (browser confirm() is blocked in some embeds) */
  ask: (text: string, onYes: () => void, yes?: string) => void;
  closeConfirm: () => void;
  openSearch: (v?: boolean) => void;
  openTemplates: (parentId: ID | null) => void;
  closeTemplates: () => void;
  openSettings: (v?: boolean) => void;
  openTrash: (v?: boolean) => void;
  openAI: (req: AIRequest | null) => void;
  setMobileSidebar: (v: boolean) => void;
  showToast: (text: string) => void;
}

export const useUI = create<UIState>((set) => ({
  searchOpen: false,
  templatesFor: null,
  settingsOpen: false,
  trashOpen: false,
  ai: null,
  mobileSidebar: false,
  toast: null,
  confirmReq: null,
  ask: (text, onYes, yes = "Eliminar") => set({ confirmReq: { text, onYes, yes } }),
  closeConfirm: () => set({ confirmReq: null }),
  openSearch: (v = true) => set({ searchOpen: v }),
  openTemplates: (parentId) => set({ templatesFor: { parentId } }),
  closeTemplates: () => set({ templatesFor: null }),
  openSettings: (v = true) => set({ settingsOpen: v }),
  openTrash: (v = true) => set({ trashOpen: v }),
  openAI: (ai) => set({ ai }),
  setMobileSidebar: (v) => set({ mobileSidebar: v }),
  showToast: (text) => {
    const id = Date.now();
    set({ toast: { id, text } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), 2600);
  },
}));
