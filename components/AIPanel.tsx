"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, CornerDownLeft, FilePlus2, ListPlus, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { getRows, newBlock, pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { markdownToBlocks, pagePlainText, pageToMarkdown } from "@/lib/markdown";
import { cx, inlineMarkdownToHtml, sanitizeHtml } from "@/lib/utils";
import type { Workspace } from "@/lib/types";
import { STATIC_DEMO } from "@/lib/persistence";

type Ctx = "selection" | "page" | "workspace" | "none";

const QUICK_TEXT = [
  ["summarize", "Resumir"],
  ["improve", "Mejorar redacción"],
  ["fix", "Corregir"],
  ["shorter", "Más corto"],
  ["longer", "Más largo"],
  ["action_items", "Extraer tareas"],
  ["translate_en", "Traducir al inglés"],
  ["translate_es", "Traducir al español"],
] as const;

const QUICK_EMPTY = [
  ["continue", "Continuar escribiendo"],
  ["summarize", "Resumir la página"],
  ["action_items", "Extraer tareas"],
  ["brainstorm", "Lluvia de ideas"],
  ["outline", "Crear un esquema"],
] as const;

const LIMIT = 100_000;

function workspaceContext(ws: Workspace) {
  const pages = Object.values(ws.pages)
    .filter((p) => !p.trashed)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  let out = "";
  let used = 0;
  for (const p of pages) {
    const text = pagePlainText(p);
    const db = p.dbId ? ws.pages[p.dbId] : undefined;
    const chunk = `### ${pageTitle(p)}${db ? ` (en ${pageTitle(db)})` : ""}\n${text}\n${p.database ? `Elementos: ${getRows(ws, p.id).map(pageTitle).join(", ")}\n` : ""}\n`;
    if (out.length + chunk.length > LIMIT) break;
    out += chunk;
    used++;
  }
  return { text: out, used, total: pages.length };
}

export function AIPanel() {
  const ui = useUI();
  const req = ui.ai!;
  const ws = useStore((s) => s.ws);
  const page = req.pageId ? ws.pages[req.pageId] : undefined;
  const [ctx, setCtx] = useState<Ctx>(req.text ? "selection" : page ? "page" : "none");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCall, setLastCall] = useState<{ action: string; prompt: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const wsCtx = useMemo(() => (ctx === "workspace" ? workspaceContext(ws) : null), [ctx, ws]);

  const run = async (action: string, p = prompt) => {
    if (STATIC_DEMO) {
      setError("En esta versión de demostración no hay servidor, así que la IA está desactivada. Funciona al ejecutar BOOKSX con Next.js y ANTHROPIC_API_KEY.");
      return;
    }
    setError(null);
    setOutput("");
    setBusy(true);
    setLastCall({ action, prompt: p });
    const controller = new AbortController();
    abortRef.current = controller;
    const body: Record<string, string> = { action, prompt: p };
    if (ctx === "selection" && req.text) body.text = req.text;
    if (ctx === "page" && page) {
      body.context = pageToMarkdown(ws, page);
      body.contextLabel = "página actual";
      if (["summarize", "improve", "fix", "shorter", "longer", "action_items", "translate_en", "translate_es", "continue"].includes(action))
        body.text = pageToMarkdown(ws, page);
    }
    if (ctx === "workspace" && wsCtx) {
      body.context = wsCtx.text;
      body.contextLabel = "espacio de trabajo";
      if (action === "custom") body.action = "ask";
    }
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" }));
        setError(data.error ?? "Error desconocido");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setOutput(acc);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const insert = () => {
    if (!page || !output.trim()) return;
    const blocks = markdownToBlocks(output);
    const st = useStore.getState();
    const current = st.ws.pages[page.id];
    if (current.database) {
      ui.showToast("Las bases de datos no tienen texto; crea una página nueva.");
      return;
    }
    const list = current.blocks.slice();
    let at = req.blockId ? list.findIndex((b) => b.id === req.blockId) + 1 : list.length;
    // replace an empty target block
    if (req.blockId) {
      const target = list[at - 1];
      if (target && target.type === "paragraph" && !target.html) {
        list.splice(at - 1, 1);
        at -= 1;
      }
    } else {
      const last = list[list.length - 1];
      if (last && last.type === "paragraph" && !last.html) {
        list.pop();
        at = list.length;
      }
    }
    list.splice(Math.max(0, at), 0, ...blocks);
    if (list[list.length - 1]?.type !== "paragraph") list.push(newBlock());
    st.setBlocks(page.id, list);
    ui.showToast("Texto insertado en la página");
    ui.openAI(null);
  };

  const toNewPage = () => {
    const blocks = markdownToBlocks(output);
    const titleBlock = blocks.find((b) => b.type === "h1");
    const st = useStore.getState();
    const id = st.createPage({
      parentId: page && !page.database && !page.dbId ? page.id : null,
      title: titleBlock ? titleBlock.html.replace(/<[^>]+>/g, "") : (prompt || "Borrador IA").slice(0, 60),
      icon: "✨",
      blocks: blocks.filter((b) => b !== titleBlock),
    });
    st.navigate(id);
    ui.openAI(null);
  };

  const preview = useMemo(() => markdownToBlocks(output), [output]);
  const quick = (ctx === "selection" && req.text) || ctx === "page" ? QUICK_TEXT : QUICK_EMPTY;

  return (
    <aside className="ai-panel" aria-label="Asistente de IA">
      <div className="ai-head">
        <Sparkles size={16} className="accent" />
        <strong>Asistente IA</strong>
        <span className="grow" />
        <button className="icon-btn" aria-label="Cerrar" onClick={() => { abortRef.current?.abort(); ui.openAI(null); }}>
          <X size={18} />
        </button>
      </div>

      <div className="ai-ctx">
        <span className="muted small">Contexto:</span>
        <div className="seg sm wrap">
          {req.text && <button className={cx(ctx === "selection" && "on")} onClick={() => setCtx("selection")}>Selección</button>}
          {page && <button className={cx(ctx === "page" && "on")} onClick={() => setCtx("page")}>Esta página</button>}
          <button className={cx(ctx === "workspace" && "on")} onClick={() => setCtx("workspace")}>Todo el espacio</button>
          <button className={cx(ctx === "none" && "on")} onClick={() => setCtx("none")}>Ninguno</button>
        </div>
        {ctx === "selection" && req.text && <blockquote className="ai-quote">{req.text.slice(0, 280)}{req.text.length > 280 ? "…" : ""}</blockquote>}
        {ctx === "workspace" && wsCtx && (
          <p className="muted small">
            Se enviarán {wsCtx.used} de {wsCtx.total} páginas{wsCtx.used < wsCtx.total ? " (las más recientes, por límite de tamaño)" : ""}.
          </p>
        )}
      </div>

      <div className="ai-quick">
        {quick.map(([a, label]) => (
          <button key={a} className="chip" disabled={busy} onClick={() => run(a, "")}>{label}</button>
        ))}
      </div>

      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim()) run("custom");
        }}
      >
        <textarea
          autoFocus
          rows={2}
          placeholder={ctx === "workspace" ? "Pregunta sobre tus páginas…" : "Pide algo a la IA: «escribe un correo de seguimiento…»"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (prompt.trim() && !busy) run("custom");
            }
          }}
        />
        {busy ? (
          <button type="button" className="btn sm" onClick={() => abortRef.current?.abort()}>
            <Square size={13} /> Detener
          </button>
        ) : (
          <button type="submit" className="btn primary sm" disabled={!prompt.trim()}>
            <CornerDownLeft size={13} /> Enviar
          </button>
        )}
      </form>

      {error && <div className="ai-error">{error}</div>}

      {(output || busy) && (
        <div className="ai-output">
          <div className="ai-preview">
            {preview.map((b) => {
              const html = { __html: sanitizeHtml(b.type === "code" ? b.html : b.html || "") };
              if (b.type === "h1") return <h2 key={b.id} dangerouslySetInnerHTML={html} />;
              if (b.type === "h2") return <h3 key={b.id} dangerouslySetInnerHTML={html} />;
              if (b.type === "h3") return <h4 key={b.id} dangerouslySetInnerHTML={html} />;
              if (b.type === "bullet" || b.type === "numbered") return <li key={b.id} style={{ marginLeft: b.indent * 16 }} dangerouslySetInnerHTML={html} />;
              if (b.type === "todo") return <div key={b.id} className="ai-todo"><input type="checkbox" readOnly checked={!!b.checked} /> <span dangerouslySetInnerHTML={html} /></div>;
              if (b.type === "divider") return <hr key={b.id} />;
              if (b.type === "code") return <pre key={b.id} dangerouslySetInnerHTML={html} />;
              if (b.type === "quote") return <blockquote key={b.id} dangerouslySetInnerHTML={html} />;
              return <p key={b.id} dangerouslySetInnerHTML={{ __html: sanitizeHtml(b.html || inlineMarkdownToHtml("")) }} />;
            })}
            {busy && <span className="cursor-blink">▍</span>}
          </div>
          {!busy && output && (
            <div className="ai-actions">
              {page && !page.database && (
                <button className="btn primary sm" onClick={insert}>
                  <ListPlus size={14} /> Insertar en la página
                </button>
              )}
              <button className="btn ghost sm" onClick={toNewPage}>
                <FilePlus2 size={14} /> Nueva página
              </button>
              <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(output).then(() => ui.showToast("Copiado"))}>
                <Copy size={14} /> Copiar
              </button>
              {lastCall && (
                <button className="btn ghost sm" onClick={() => run(lastCall.action, lastCall.prompt)}>
                  <RotateCcw size={14} /> Reintentar
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <p className="ai-note muted small">La IA puede equivocarse. Revisa el resultado antes de usarlo.</p>
    </aside>
  );
}
