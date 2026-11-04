"use client";

import { useEffect } from "react";
import { FileText, LayoutTemplate, Plus, Sparkles } from "lucide-react";
import { pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { flushSave, onSaveState } from "@/lib/persistence";
import { seedWorkspace } from "@/lib/templates";
import { formatRelative } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { PageBody } from "./PageView";
import { RowPeek } from "./RowPeek";
import { SearchModal } from "./SearchModal";
import { TemplatesModal } from "./TemplatesModal";
import { SettingsModal } from "./SettingsModal";
import { TrashModal } from "./TrashModal";
import { AIPanel } from "./AIPanel";
import { Modal } from "./ui/Popover";

// "#p-<id>": a plain hash name works everywhere, including embedded viewers
function idFromHash(): string | null {
  const m = window.location.hash.match(/^#(?:p-|\/p\/)([\w]+)/);
  return m ? m[1] : null;
}

export function App() {
  const hydrated = useStore((s) => s.hydrated);
  const currentPageId = useStore((s) => s.currentPageId);
  const page = useStore((s) => (s.currentPageId ? s.ws.pages[s.currentPageId] : undefined));
  const settings = useStore((s) => s.ws.settings);
  const ui = useUI();

  // hydrate + seed + initial route
  useEffect(() => {
    const st = useStore.getState();
    st.hydrate();
    const after = useStore.getState();
    if (Object.keys(after.ws.pages).length === 0) {
      seedWorkspace();
    } else {
      const fromHash = idFromHash();
      const target = fromHash && after.ws.pages[fromHash] && !after.ws.pages[fromHash].trashed ? fromHash : after.ws.rootOrder.find((id) => !after.ws.pages[id]?.trashed) ?? null;
      after.navigate(target);
    }
    const off = onSaveState((state, at) => useStore.getState().setSaveState(state, at));
    const onToast = (e: Event) => useUI.getState().showToast(String((e as CustomEvent).detail));
    window.addEventListener("booksx:toast", onToast);
    const onUnload = () => flushSave();
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      off();
      window.removeEventListener("booksx:toast", onToast);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    };
  }, []);

  // installable app: register the service worker where the page offers a manifest
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !document.querySelector('link[rel="manifest"]')) return;
    if (process.env.NODE_ENV !== "production") return;
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
    navigator.serviceWorker.register(new URL("sw.js", href)).catch(() => {
      /* not available here (e.g. embedded preview); the app still works online */
    });
  }, []);

  // hash <-> current page
  useEffect(() => {
    if (!hydrated) return;
    const want = currentPageId ? `#p-${currentPageId}` : "";
    if (window.location.hash !== want) {
      if (want) window.location.hash = want;
      else history.replaceState(null, "", window.location.pathname);
    }
    if (page) document.title = `${page.icon ? page.icon + " " : ""}${pageTitle(page)} · BOOKSX`;
    else document.title = "BOOKSX";
    document.querySelector(".main-scroll")?.scrollTo({ top: 0 });
  }, [currentPageId, hydrated, page?.title, page?.icon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHash = () => {
      const id = idFromHash();
      const st = useStore.getState();
      if (id && id !== st.currentPageId && st.ws.pages[id]) st.navigate(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // theme + accent + sidebar width
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    root.style.setProperty("--accent", settings.accent);
    root.style.setProperty("--sidebar-w", `${settings.sidebarWidth}px`);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme, settings.accent, settings.sidebarWidth]);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const st = useStore.getState();
      const key = e.key.toLowerCase();
      if (key === "k" && !window.getSelection()?.toString()) {
        e.preventDefault();
        useUI.getState().openSearch(!useUI.getState().searchOpen);
      } else if (key === "\\") {
        e.preventDefault();
        if (window.innerWidth < 768) useUI.getState().setMobileSidebar(!useUI.getState().mobileSidebar);
        else st.updateSettings({ sidebarOpen: !st.ws.settings.sidebarOpen });
      } else if (key === "j") {
        e.preventDefault();
        const text = window.getSelection()?.toString() || undefined;
        useUI.getState().openAI(useUI.getState().ai ? null : { pageId: st.currentPageId, text });
      } else if (key === "l" && e.shiftKey) {
        e.preventDefault();
        st.updateSettings({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" });
      } else if (key === "n" && e.altKey) {
        e.preventDefault();
        st.navigate(st.createPage({}));
      } else if (key === "s") {
        // everything autosaves; just flush now
        e.preventDefault();
        flushSave();
        useUI.getState().showToast("Guardado");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!hydrated) {
    return <div className="boot">BOOKSX</div>;
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Topbar />
        <div className="main-scroll">{currentPageId && page && !page.trashed ? <PageBody key={currentPageId} pageId={currentPageId} /> : <Home />}</div>
      </main>
      <RowPeek />
      {ui.ai && <AIPanel />}
      {ui.searchOpen && <SearchModal />}
      {ui.templatesFor && <TemplatesModal />}
      {ui.settingsOpen && <SettingsModal />}
      {ui.trashOpen && <TrashModal />}
      {ui.confirmReq && (
        <Modal onClose={ui.closeConfirm} width={400}>
          <p className="confirm-text">{ui.confirmReq.text}</p>
          <div className="row end gap-sm">
            <button className="btn ghost sm" autoFocus onClick={ui.closeConfirm}>Cancelar</button>
            <button
              className="btn sm danger-solid"
              onClick={() => {
                const r = ui.confirmReq;
                ui.closeConfirm();
                r?.onYes();
              }}
            >
              {ui.confirmReq.yes}
            </button>
          </div>
        </Modal>
      )}
      {ui.toast && (
        <div className="toast" role="status" key={ui.toast.id}>
          {ui.toast.text}
        </div>
      )}
    </div>
  );
}

function Home() {
  const ws = useStore((s) => s.ws);
  const navigate = useStore((s) => s.navigate);
  const ui = useUI();
  const recent = Object.values(ws.pages)
    .filter((p) => !p.trashed && !p.dbId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  return (
    <div className="home">
      <h1>{greet}, {ws.settings.userName}</h1>
      <div className="home-actions">
        <button className="home-card" onClick={() => navigate(useStore.getState().createPage({}))}>
          <Plus size={18} /> Nueva página
        </button>
        <button className="home-card" onClick={() => ui.openTemplates(null)}>
          <LayoutTemplate size={18} /> Desde plantilla
        </button>
        <button className="home-card" onClick={() => ui.openAI({ pageId: null })}>
          <Sparkles size={18} /> Pedir a la IA
        </button>
      </div>
      {recent.length > 0 && (
        <>
          <h2 className="home-sub">Visitado recientemente</h2>
          <div className="home-recent">
            {recent.map((p) => (
              <button key={p.id} className="recent-card" onClick={() => navigate(p.id)}>
                <span className="recent-cover" style={p.cover ? { background: p.cover } : undefined} />
                <span className="recent-icon">{p.icon || <FileText size={18} />}</span>
                <span className="recent-title">{pageTitle(p)}</span>
                <span className="muted small">{formatRelative(p.updatedAt)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
