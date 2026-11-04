"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  GripVertical,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  FileText,
  Database as DbIcon,
  Repeat,
} from "lucide-react";
import type { Block, BlockType, ID, Workspace } from "@/lib/types";
import { defaultDatabase, defaultView, newBlock, pageTitle, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { cx, sanitizeHtml, stripTags, escapeHtml, uid } from "@/lib/utils";
import { markdownToBlocks } from "@/lib/markdown";
import {
  caretOnFirstLine,
  caretOnLastLine,
  caretRect,
  deleteBeforeCaret,
  getCaretOffset,
  isCaretAtEnd,
  isCaretAtStart,
  normalize,
  selectTextRange,
  setCaret,
  splitAtCaret,
  textBeforeCaret,
} from "./caret";
import { COLORS, filterSlash, PLACEHOLDER, TEXT_TYPES, TURN_INTO, type SlashItem } from "./blockTypes";
import { MenuItem, MenuSeparator, MenuTitle, Popover, anchorFrom, type Anchor } from "../ui/Popover";
import { SelectionToolbar } from "./SelectionToolbar";
import { DatabaseView } from "../database/DatabaseView";
import { PagePicker } from "../PagePicker";
import { EmojiPicker } from "../ui/EmojiPicker";

type FocusReq = { id: ID; pos: "start" | "end" | number } | null;

const LIST_TYPES: BlockType[] = ["bullet", "numbered", "todo", "toggle"];
/** block types where markdown shortcuts at the start of the line convert the block */
const SHORTCUT_TYPES: BlockType[] = ["paragraph", "bullet", "numbered", "todo", "toggle", "quote"];

const SHORTCUTS: Array<[string, BlockType]> = [
  ["### ", "h3"],
  ["## ", "h2"],
  ["# ", "h1"],
  ["- ", "bullet"],
  ["* ", "bullet"],
  ["+ ", "bullet"],
  ["1. ", "numbered"],
  ["1) ", "numbered"],
  ["[] ", "todo"],
  ["[ ] ", "todo"],
  [">> ", "toggle"],
  ["> ", "quote"],
  ["! ", "callout"],
];

/** index range [i, end) of a block and the blocks nested under it */
function subtreeEnd(blocks: Block[], i: number) {
  let end = i + 1;
  while (end < blocks.length && blocks[end].indent > blocks[i].indent) end++;
  return end;
}

export function Editor({ pageId, readOnly = false }: { pageId: ID; readOnly?: boolean }) {
  const page = useStore((s) => s.ws.pages[pageId]);
  const setBlocks = useStore((s) => s.setBlocks);
  const blocks = page?.blocks ?? [];
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const refs = useRef(new Map<ID, HTMLElement>());
  const focusReq = useRef<FocusReq>(null);
  const [slash, setSlash] = useState<{ blockId: ID; start: number; query: string; index: number; anchor: Anchor } | null>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const [blockMenu, setBlockMenu] = useState<{ blockId: ID; anchor: Anchor } | null>(null);
  const [linkPicker, setLinkPicker] = useState<{ blockId: ID; anchor: Anchor } | null>(null);
  const [emojiFor, setEmojiFor] = useState<{ blockId: ID; anchor: Anchor } | null>(null);
  const [selected, setSelected] = useState<ID | null>(null);
  const [drag, setDrag] = useState<ID | null>(null);
  const [dropAt, setDropAt] = useState<{ id: ID; pos: "before" | "after" } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------- mutations
  const commit = useCallback(
    (next: Block[], focus?: FocusReq) => {
      if (focus) focusReq.current = focus;
      blocksRef.current = next;
      setBlocks(pageId, next.length ? next : [newBlock()]);
    },
    [pageId, setBlocks],
  );

  const patch = useCallback(
    (id: ID, p: Partial<Block>, focus?: FocusReq) => {
      commit(blocksRef.current.map((b) => (b.id === id ? { ...b, ...p } : b)), focus);
    },
    [commit],
  );

  const insertAfter = useCallback(
    (id: ID, items: Block[], focus?: FocusReq) => {
      const list = blocksRef.current.slice();
      const i = list.findIndex((b) => b.id === id);
      // skip hidden children of a closed toggle
      let at = i + 1;
      if (i >= 0 && list[i].type === "toggle" && !list[i].open) at = subtreeEnd(list, i);
      list.splice(i < 0 ? list.length : at, 0, ...items);
      commit(list, focus ?? (items[0] ? { id: items[0].id, pos: "start" } : null));
    },
    [commit],
  );

  const remove = useCallback(
    (id: ID, focusPrev = true) => {
      const list = blocksRef.current;
      const i = list.findIndex((b) => b.id === id);
      if (i < 0) return;
      const prev = list.slice(0, i).reverse().find((b) => TEXT_TYPES.includes(b.type));
      commit(list.filter((b) => b.id !== id), focusPrev && prev ? { id: prev.id, pos: "end" } : null);
    },
    [commit],
  );

  const duplicate = useCallback(
    (id: ID) => {
      const list = blocksRef.current.slice();
      const i = list.findIndex((b) => b.id === id);
      if (i < 0) return;
      const end = subtreeEnd(list, i);
      const copies = list.slice(i, end).map((b) => ({ ...b, id: uid() }));
      // page / database references are not duplicated as links to the same page
      const safe = copies.filter((b) => b.type !== "page" && b.type !== "database");
      list.splice(end, 0, ...safe);
      commit(list, safe[0] ? { id: safe[0].id, pos: "end" } : null);
    },
    [commit],
  );

  const move = useCallback(
    (id: ID, dir: -1 | 1) => {
      const list = blocksRef.current.slice();
      const i = list.findIndex((b) => b.id === id);
      if (i < 0) return;
      const end = subtreeEnd(list, i);
      const chunk = list.slice(i, end);
      list.splice(i, chunk.length);
      let target: number;
      if (dir === -1) {
        target = i - 1;
        while (target > 0 && list[target].indent > chunk[0].indent) target--;
        target = Math.max(0, target);
      } else {
        if (i >= list.length) return;
        target = subtreeEnd(list, i);
      }
      list.splice(target, 0, ...chunk);
      commit(list, { id, pos: getCaretOffset(refs.current.get(id) ?? document.body) });
    },
    [commit],
  );

  // apply focus requests after render
  useLayoutEffect(() => {
    const req = focusReq.current;
    if (!req) return;
    if (!req.id) {
      focusReq.current = null;
      return;
    }
    const el = refs.current.get(req.id);
    if (el) {
      focusReq.current = null;
      setCaret(el, req.pos);
    }
  });

  // ------------------------------------------------------------ slash menu
  const slashItems = useMemo(() => (slash ? filterSlash(slash.query) : []), [slash]);

  const runSlash = useCallback(
    (item: SlashItem) => {
      const s = slashRef.current;
      if (!s) return;
      setSlash(null);
      const el = refs.current.get(s.blockId);
      const block = blocksRef.current.find((b) => b.id === s.blockId);
      if (!el || !block) return;
      // remove "/query"
      selectTextRange(el, s.start, getCaretOffset(el));
      document.execCommand("delete");
      const html = normalize(sanitizeHtml(el.innerHTML));
      const isBlank = !stripTags(html).trim();
      let list = blocksRef.current.map((b) => (b.id === block.id ? { ...b, html } : b));
      blocksRef.current = list;
      const store = useStore.getState();

      if (item.blockType) {
        if (isBlank) {
          const extra: Partial<Block> = item.blockType === "callout" ? { emoji: "💡" } : item.blockType === "toggle" ? { open: true } : {};
          commit(list.map((b) => (b.id === block.id ? { ...b, type: item.blockType!, ...extra } : b)), { id: block.id, pos: "start" });
        } else {
          const nb = newBlock({ type: item.blockType, indent: block.indent, emoji: item.blockType === "callout" ? "💡" : undefined });
          insertAfter(block.id, [nb]);
        }
        return;
      }
      switch (item.special) {
        case "divider": {
          const after = newBlock({ indent: block.indent });
          if (isBlank) {
            list = list.map((b) => (b.id === block.id ? { ...b, type: "divider" as const, html: "" } : b));
            const i = list.findIndex((b) => b.id === block.id);
            list.splice(i + 1, 0, after);
            commit(list, { id: after.id, pos: "start" });
          } else insertAfter(block.id, [newBlock({ type: "divider" }), after], { id: after.id, pos: "start" });
          return;
        }
        case "image": {
          const img = newBlock({ type: "image", url: "" });
          if (isBlank) commit(list.map((b) => (b.id === block.id ? img : b)));
          else insertAfter(block.id, [img], { id: "", pos: "start" });
          return;
        }
        case "page": {
          commit(list);
          const id = store.createPage({ parentId: pageId, afterBlockId: block.id });
          if (isBlank) {
            const latest = useStore.getState().ws.pages[pageId].blocks.filter((b) => b.id !== block.id);
            setBlocks(pageId, latest);
          }
          store.navigate(id);
          return;
        }
        case "database": {
          commit(list);
          const db = defaultDatabase();
          db.views = [defaultView(item.view ?? "table", db)];
          if (item.view === "board") {
            db.views[0].groupBy = db.properties.find((p) => p.type === "status")?.id;
          }
          if (item.view && item.view !== "table") db.views.push(defaultView("table", db));
          const dbId = store.createPage({ parentId: pageId, afterBlockId: block.id, database: db, inline: true, title: "" });
          const today = new Date();
          const iso = today.toISOString().slice(0, 10);
          const dateProp = db.properties.find((p) => p.type === "date")!.id;
          store.addRow(dbId, { [dateProp]: { start: iso } }, { title: "Primer elemento" });
          if (isBlank) {
            const latest = useStore.getState().ws.pages[pageId].blocks.filter((b) => b.id !== block.id);
            setBlocks(pageId, latest);
          }
          return;
        }
        case "link_page": {
          commit(list);
          setLinkPicker({ blockId: block.id, anchor: s.anchor });
          return;
        }
        case "ai": {
          commit(list);
          useUI.getState().openAI({ pageId, blockId: block.id });
          return;
        }
      }
    },
    [commit, insertAfter, pageId, setBlocks],
  );

  // ------------------------------------------------------------- handlers
  const onInput = useCallback(
    (block: Block, el: HTMLElement) => {
      const html = normalize(el.innerHTML);
      // markdown shortcuts at the beginning of a text block
      if (SHORTCUT_TYPES.includes(block.type)) {
        const before = textBeforeCaret(el).replace(/\u00a0/g, " ");
        for (const [prefix, type] of SHORTCUTS) {
          if (before === prefix && type !== block.type) {
            deleteBeforeCaret(el, prefix.length);
            const rest = sanitizeHtml(normalize(el.innerHTML));
            patch(block.id, {
              type,
              html: rest,
              ...(type === "callout" ? { emoji: "💡" } : {}),
              ...(type === "toggle" ? { open: true } : {}),
            }, { id: block.id, pos: "start" });
            return;
          }
        }
        if (block.type === "paragraph" && (before === "---" || before === "***")) {
          const after = newBlock();
          const list = blocksRef.current.map((b) => (b.id === block.id ? { ...b, type: "divider" as const, html: "" } : b));
          list.splice(list.findIndex((b) => b.id === block.id) + 1, 0, after);
          commit(list, { id: after.id, pos: "start" });
          return;
        }
        if (block.type === "paragraph" && before === "```") {
          patch(block.id, { type: "code", html: "", language: "texto" }, { id: block.id, pos: "start" });
          return;
        }
      }

      // slash menu tracking
      const s = slashRef.current;
      const text = el.textContent ?? "";
      const caret = getCaretOffset(el);
      if (s && s.blockId === block.id) {
        if (caret <= s.start || text[s.start] !== "/") setSlash(null);
        else {
          const query = text.slice(s.start + 1, caret);
          if (query.length > 24 || /\s{2,}/.test(query)) setSlash(null);
          else setSlash({ ...s, query, index: 0 });
        }
      } else if (block.type !== "code" && text[caret - 1] === "/" && (caret === 1 || /\s/.test(text[caret - 2]))) {
        const r = caretRect();
        setSlash({
          blockId: block.id,
          start: caret - 1,
          query: "",
          index: 0,
          anchor: r ? { x: r.left, y: r.bottom + 6, h: r.height + 12 } : anchorFrom(el),
        });
      }

      const clean = block.type === "code" ? escapeHtml(el.innerText.replace(/\n$/, "")) : html;
      commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, html: clean } : b)));
    },
    [commit, patch],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, block: Block) => {
      const el = e.currentTarget as HTMLElement;
      const list = blocksRef.current;
      const i = list.findIndex((b) => b.id === block.id);
      const mod = e.metaKey || e.ctrlKey;

      // slash menu navigation
      const s = slashRef.current;
      if (s && s.blockId === block.id) {
        const items = filterSlash(s.query);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlash({ ...s, index: (s.index + 1) % Math.max(1, items.length) });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlash({ ...s, index: (s.index - 1 + items.length) % Math.max(1, items.length) });
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (items[s.index]) runSlash(items[s.index]);
          else setSlash(null);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlash(null);
          return;
        }
      }

      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(block.id);
        return;
      }
      if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        move(block.id, e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        if (block.type === "todo") patch(block.id, { checked: !block.checked });
        if (block.type === "toggle") patch(block.id, { open: !block.open });
        return;
      }
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const sel = window.getSelection();
        const text = sel?.toString() ?? "";
        if (text) document.execCommand("insertHTML", false, `<code>${escapeHtml(text)}</code>&#8203;`);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        el.blur();
        setSelected(block.id);
        wrapRef.current?.focus();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (block.type === "code") {
          if (mod) return;
          e.preventDefault();
          document.execCommand("insertText", false, "\n");
          return;
        }
        e.preventDefault();
        const [before, after] = splitAtCaret(el);
        const empty = !stripTags(before).trim() && !stripTags(after).trim();
        if (empty && LIST_TYPES.includes(block.type)) {
          if (block.indent > 0) patch(block.id, { indent: block.indent - 1 }, { id: block.id, pos: "start" });
          else patch(block.id, { type: "paragraph" }, { id: block.id, pos: "start" });
          return;
        }
        if (empty && (block.type === "quote" || block.type === "callout")) {
          patch(block.id, { type: "paragraph" }, { id: block.id, pos: "start" });
          return;
        }
        if (!stripTags(before).trim() && stripTags(after).trim()) {
          // caret at start: insert an empty block above
          const nb = newBlock({ indent: block.indent });
          const next = list.slice();
          next.splice(i, 0, nb);
          commit(next, { id: block.id, pos: "start" });
          return;
        }
        let type: BlockType = ["bullet", "numbered", "todo"].includes(block.type) ? block.type : "paragraph";
        let indent = block.indent;
        if (block.type === "toggle") {
          if (block.open) indent = block.indent + 1;
          else type = "toggle";
        }
        const nb = newBlock({ type, indent, html: sanitizeHtml(after) });
        const next = list.map((b) => (b.id === block.id ? { ...b, html: sanitizeHtml(before) } : b));
        let at = i + 1;
        if (block.type === "toggle" && !block.open) at = subtreeEnd(next, i);
        next.splice(at, 0, nb);
        commit(next, { id: nb.id, pos: "start" });
        return;
      }

      if (e.key === "Backspace" && isCaretAtStart(el)) {
        e.preventDefault();
        if (block.type !== "paragraph") {
          patch(block.id, { type: "paragraph" }, { id: block.id, pos: "start" });
          return;
        }
        if (block.indent > 0) {
          patch(block.id, { indent: block.indent - 1 }, { id: block.id, pos: "start" });
          return;
        }
        // merge into the previous visible text block
        let j = i - 1;
        while (j >= 0 && isHidden(list, j)) j--;
        if (j < 0) return;
        const prev = list[j];
        if (!TEXT_TYPES.includes(prev.type)) {
          if (prev.type === "divider" || prev.type === "image") {
            commit(list.filter((b) => b.id !== prev.id), { id: block.id, pos: "start" });
          } else if (!stripTags(block.html).trim()) {
            remove(block.id, false);
          }
          return;
        }
        const prevEl = refs.current.get(prev.id);
        const prevLen = prevEl ? (prevEl.textContent ?? "").length : stripTags(prev.html).length;
        const merged = (prev.html || "") + (block.html || "");
        commit(
          list.filter((b) => b.id !== block.id).map((b) => (b.id === prev.id ? { ...b, html: merged } : b)),
          { id: prev.id, pos: prevLen },
        );
        return;
      }

      if (e.key === "Delete" && isCaretAtEnd(el)) {
        const next = list[i + 1];
        if (next && TEXT_TYPES.includes(next.type) && next.indent >= block.indent) {
          e.preventDefault();
          const len = (el.textContent ?? "").length;
          commit(
            list.filter((b) => b.id !== next.id).map((b) => (b.id === block.id ? { ...b, html: block.html + next.html } : b)),
            { id: block.id, pos: len },
          );
        }
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          if (block.indent > 0) patch(block.id, { indent: block.indent - 1 }, { id: block.id, pos: getCaretOffset(el) });
        } else {
          const prev = list[i - 1];
          const max = prev ? prev.indent + 1 : 0;
          if (block.indent < Math.min(max, 6)) patch(block.id, { indent: block.indent + 1 }, { id: block.id, pos: getCaretOffset(el) });
        }
        return;
      }

      if ((e.key === "ArrowUp" && caretOnFirstLine(el)) || (e.key === "ArrowLeft" && isCaretAtStart(el))) {
        const target = neighbourText(list, i, -1);
        if (target) {
          e.preventDefault();
          const t = refs.current.get(target.id);
          if (t) setCaret(t, e.key === "ArrowLeft" ? "end" : Math.min(getCaretOffset(el), (t.textContent ?? "").length));
        }
        return;
      }
      if ((e.key === "ArrowDown" && caretOnLastLine(el)) || (e.key === "ArrowRight" && isCaretAtEnd(el))) {
        const target = neighbourText(list, i, 1);
        if (target) {
          e.preventDefault();
          const t = refs.current.get(target.id);
          if (t) setCaret(t, e.key === "ArrowRight" ? "start" : Math.min(getCaretOffset(el), (t.textContent ?? "").length));
        }
      }
    },
    [commit, duplicate, move, patch, remove, runSlash],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>, block: Block) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      if (block.type === "code" || !text.includes("\n")) {
        document.execCommand("insertText", false, text);
        return;
      }
      const parsed = markdownToBlocks(text);
      if (!parsed.length) return;
      const el = refs.current.get(block.id);
      const isBlank = !el || !(el.textContent ?? "").trim();
      const list = blocksRef.current.slice();
      const i = list.findIndex((b) => b.id === block.id);
      const shifted = parsed.map((b) => ({ ...b, indent: b.indent + block.indent }));
      if (isBlank) list.splice(i, 1, ...shifted);
      else list.splice(i + 1, 0, ...shifted);
      const last = shifted[shifted.length - 1];
      commit(list, { id: last.id, pos: "end" });
    },
    [commit],
  );

  // keyboard on selected block (after Escape)
  const onWrapKey = (e: React.KeyboardEvent) => {
    if (!selected || e.target !== wrapRef.current) return;
    const list = blocksRef.current;
    const i = list.findIndex((b) => b.id === selected);
    if (i < 0) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const nextSel = list[i + 1]?.id ?? list[i - 1]?.id ?? null;
      commit(list.filter((b) => b.id !== selected));
      setSelected(nextSel);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const el = refs.current.get(selected);
      setSelected(null);
      if (el) setCaret(el, "end");
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const j = i + (e.key === "ArrowDown" ? 1 : -1);
      if (list[j]) setSelected(list[j].id);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicate(selected);
    } else if (e.key === "Escape") {
      setSelected(null);
    }
  };

  useEffect(() => {
    if (!selected) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(`[data-block-id="${selected}"]`)) setSelected(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selected]);

  // ---------------------------------------------------------- drag & drop
  const onDrop = () => {
    if (!drag || !dropAt || drag === dropAt.id) return reset();
    const list = blocksRef.current.slice();
    const from = list.findIndex((b) => b.id === drag);
    const end = subtreeEnd(list, from);
    const chunk = list.slice(from, end);
    if (chunk.some((b) => b.id === dropAt.id)) return reset();
    list.splice(from, chunk.length);
    let to = list.findIndex((b) => b.id === dropAt.id);
    const target = list[to];
    if (dropAt.pos === "after") to = subtreeEnd(list, to);
    const delta = target.indent - chunk[0].indent;
    list.splice(to, 0, ...chunk.map((b) => ({ ...b, indent: Math.max(0, b.indent + delta) })));
    commit(list);
    reset();
    function reset() {
      setDrag(null);
      setDropAt(null);
    }
  };

  // ------------------------------------------------------------- render
  const ws = useStore((s) => s.ws);
  const numbers = useMemo(() => numberBlocks(blocks), [blocks]);

  const addBelowLast = () => {
    const last = blocksRef.current[blocksRef.current.length - 1];
    if (last && TEXT_TYPES.includes(last.type) && !stripTags(last.html).trim() && last.type === "paragraph") {
      const el = refs.current.get(last.id);
      if (el) setCaret(el, "end");
      return;
    }
    const nb = newBlock();
    commit([...blocksRef.current, nb], { id: nb.id, pos: "start" });
  };

  if (!page) return null;

  return (
    <div
      className="editor"
      ref={wrapRef}
      tabIndex={-1}
      onKeyDown={onWrapKey}
      onDragOver={(e) => drag && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {blocks.map((block, i) => {
        if (isHidden(blocks, i)) return null;
        return (
          <BlockRow
            key={block.id}
            block={block}
            number={numbers[i]}
            ws={ws}
            pageId={pageId}
            readOnly={readOnly}
            selected={selected === block.id}
            dropPos={dropAt?.id === block.id ? dropAt.pos : null}
            registerRef={(el) => {
              if (el) refs.current.set(block.id, el);
              else refs.current.delete(block.id);
            }}
            onInput={onInput}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onPatch={patch}
            onAddBelow={() => insertAfter(block.id, [newBlock({ indent: block.indent })])}
            onOpenMenu={(anchor) => setBlockMenu({ blockId: block.id, anchor })}
            onEmoji={(anchor) => setEmojiFor({ blockId: block.id, anchor })}
            onDragStart={() => setDrag(block.id)}
            onDragEnd={() => {
              setDrag(null);
              setDropAt(null);
            }}
            onDragOverBlock={(pos) => drag && setDropAt({ id: block.id, pos })}
          />
        );
      })}
      {!readOnly && <div className="editor-tail" onClick={addBelowLast} />}

      {!readOnly && <SelectionToolbar containerRef={wrapRef} pageId={pageId} />}

      {slash && (
        <Popover anchor={slash.anchor} onClose={() => setSlash(null)} width={300} className="slash-menu">
          {slashItems.length === 0 ? (
            <div className="menu-empty">Sin resultados</div>
          ) : (
            slashItems.map((item, idx) => (
              <div key={item.id}>
                {(idx === 0 || slashItems[idx - 1].group !== item.group) && <MenuTitle>{item.group}</MenuTitle>}
                <button
                  className={cx("slash-item", idx === slash.index && "active")}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSlash((s) => (s ? { ...s, index: idx } : s))}
                  onClick={() => runSlash(item)}
                  ref={(el) => {
                    if (el && idx === slash.index) el.scrollIntoView({ block: "nearest" });
                  }}
                >
                  <span className="slash-icon">{item.icon}</span>
                  <span>
                    <span className="slash-label">{item.label}</span>
                    <span className="slash-desc">{item.description}</span>
                  </span>
                </button>
              </div>
            ))
          )}
        </Popover>
      )}

      {blockMenu && (
        <BlockMenu
          block={blocks.find((b) => b.id === blockMenu.blockId)!}
          anchor={blockMenu.anchor}
          onClose={() => setBlockMenu(null)}
          onTurnInto={(type) => {
            const b = blocks.find((x) => x.id === blockMenu.blockId);
            if (b) patch(b.id, { type, ...(type === "callout" && !b.emoji ? { emoji: "💡" } : {}), ...(type === "toggle" ? { open: true } : {}) }, { id: b.id, pos: "end" });
            setBlockMenu(null);
          }}
          onColor={(color) => {
            patch(blockMenu.blockId, { color });
            setBlockMenu(null);
          }}
          onDuplicate={() => {
            duplicate(blockMenu.blockId);
            setBlockMenu(null);
          }}
          onMove={(dir) => {
            move(blockMenu.blockId, dir);
            setBlockMenu(null);
          }}
          onDelete={() => {
            remove(blockMenu.blockId);
            setBlockMenu(null);
          }}
          onAI={() => {
            const b = blocks.find((x) => x.id === blockMenu.blockId);
            useUI.getState().openAI({ pageId, blockId: blockMenu.blockId, text: b ? stripTags(b.html) : "" });
            setBlockMenu(null);
          }}
        />
      )}

      {linkPicker && (
        <PagePicker
          anchor={linkPicker.anchor}
          excludeId={pageId}
          onClose={() => setLinkPicker(null)}
          onPick={(target) => {
            const b = blocksRef.current.find((x) => x.id === linkPicker.blockId);
            const link = newBlock({ type: "page", refId: target, indent: b?.indent ?? 0 });
            if (b && !stripTags(b.html).trim() && b.type === "paragraph") {
              commit(blocksRef.current.map((x) => (x.id === b.id ? link : x)));
            } else insertAfter(linkPicker.blockId, [link], { id: "", pos: "start" });
            setLinkPicker(null);
          }}
        />
      )}

      {emojiFor && (
        <EmojiPicker
          anchor={emojiFor.anchor}
          allowRemove={false}
          onClose={() => setEmojiFor(null)}
          onPick={(emoji) => emoji && patch(emojiFor.blockId, { emoji })}
        />
      )}
    </div>
  );
}

function isHidden(blocks: Block[], i: number) {
  const indent = blocks[i].indent;
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j];
    if (b.indent < indent) {
      if (b.type === "toggle" && !b.open) return true;
      // keep walking up to check outer toggles
      return isHidden(blocks, j);
    }
  }
  return false;
}

function neighbourText(list: Block[], i: number, dir: -1 | 1): Block | undefined {
  for (let j = i + dir; j >= 0 && j < list.length; j += dir) {
    if (isHidden(list, j)) continue;
    if (TEXT_TYPES.includes(list[j].type)) return list[j];
  }
  return undefined;
}

function numberBlocks(blocks: Block[]): number[] {
  const out: number[] = [];
  const counters: number[] = [];
  blocks.forEach((b, i) => {
    counters.length = b.indent + 1;
    if (b.type === "numbered") {
      counters[b.indent] = (counters[b.indent] ?? 0) + 1;
      out[i] = counters[b.indent];
    } else {
      counters[b.indent] = 0;
      out[i] = 0;
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// one block row
// ---------------------------------------------------------------------------

interface RowProps {
  block: Block;
  number: number;
  ws: Workspace;
  pageId: ID;
  readOnly: boolean;
  selected: boolean;
  dropPos: "before" | "after" | null;
  registerRef: (el: HTMLElement | null) => void;
  onInput: (b: Block, el: HTMLElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>, b: Block) => void;
  onPaste: (e: React.ClipboardEvent<HTMLElement>, b: Block) => void;
  onPatch: (id: ID, p: Partial<Block>) => void;
  onAddBelow: () => void;
  onOpenMenu: (a: Anchor) => void;
  onEmoji: (a: Anchor) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverBlock: (pos: "before" | "after") => void;
}

const BlockRow = memo(function BlockRow(props: RowProps) {
  const { block, readOnly } = props;
  return (
    <div
      className={cx(
        "block",
        `block-${block.type}`,
        block.color && block.color !== "default" && `color-${block.color}`,
        props.selected && "selected",
        props.dropPos && `drop-${props.dropPos}`,
      )}
      style={{ paddingLeft: block.indent * 26 }}
      data-block-id={block.id}
      onDragOver={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        props.onDragOverBlock(e.clientY < r.top + r.height / 2 ? "before" : "after");
      }}
    >
      {!readOnly && (
        <div className="block-handle" contentEditable={false}>
          <button className="icon-btn xs" aria-label="Añadir bloque debajo" onClick={props.onAddBelow}>
            <Plus size={15} />
          </button>
          <button
            className="icon-btn xs grip"
            aria-label="Arrastrar o abrir menú del bloque"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", block.id);
              const row = (e.currentTarget as HTMLElement).closest(".block");
              if (row) e.dataTransfer.setDragImage(row, 20, 12);
              props.onDragStart();
            }}
            onDragEnd={props.onDragEnd}
            onClick={(e) => props.onOpenMenu(anchorFrom(e.currentTarget))}
          >
            <GripVertical size={15} />
          </button>
        </div>
      )}
      <BlockBody {...props} />
    </div>
  );
});

function BlockBody(props: RowProps) {
  const { block, ws, readOnly } = props;
  const navigate = useStore((s) => s.navigate);

  switch (block.type) {
    case "divider":
      return <div className="block-content"><hr /></div>;
    case "image":
      return <ImageBlock block={block} readOnly={readOnly} onPatch={props.onPatch} />;
    case "page": {
      const target = block.refId ? ws.pages[block.refId] : undefined;
      if (!target || target.trashed) return <div className="block-content muted small">Página eliminada</div>;
      return (
        <div className="block-content">
          <button className="page-link" onClick={() => navigate(target.id)}>
            <span className="page-link-icon">{target.icon || (target.database ? <DbIcon size={17} /> : <FileText size={17} />)}</span>
            <span className="page-link-title">{pageTitle(target)}</span>
          </button>
        </div>
      );
    }
    case "database": {
      const target = block.refId ? ws.pages[block.refId] : undefined;
      if (!target || target.trashed || !target.database) return <div className="block-content muted small">Base de datos eliminada</div>;
      if (!target.inline)
        return (
          <div className="block-content">
            <button className="page-link" onClick={() => navigate(target.id)}>
              <span className="page-link-icon">{target.icon || <DbIcon size={17} />}</span>
              <span className="page-link-title">{pageTitle(target)}</span>
            </button>
          </div>
        );
      return (
        <div className="block-content inline-db">
          <DatabaseView dbId={target.id} inline />
        </div>
      );
    }
  }

  return (
    <div className="block-content">
      {block.type === "bullet" && <span className="block-marker bullet-marker">•</span>}
      {block.type === "numbered" && <span className="block-marker num-marker">{props.number}.</span>}
      {block.type === "todo" && (
        <span className="block-marker">
          <input
            type="checkbox"
            className="todo-check"
            checked={!!block.checked}
            disabled={readOnly}
            onChange={() => props.onPatch(block.id, { checked: !block.checked })}
            aria-label="Completada"
          />
        </span>
      )}
      {block.type === "toggle" && (
        <button
          className={cx("block-marker toggle-arrow", block.open && "open")}
          aria-label={block.open ? "Cerrar" : "Abrir"}
          onClick={() => props.onPatch(block.id, { open: !block.open })}
        >
          <ChevronRight size={16} />
        </button>
      )}
      {block.type === "callout" && (
        <button className="block-marker callout-emoji" onClick={(e) => !readOnly && props.onEmoji(anchorFrom(e.currentTarget))}>
          {block.emoji || "💡"}
        </button>
      )}
      {block.type === "code" && (
        <select
          className="code-lang"
          value={block.language ?? "texto"}
          disabled={readOnly}
          onChange={(e) => props.onPatch(block.id, { language: e.target.value })}
        >
          {["texto", "javascript", "typescript", "python", "html", "css", "json", "sql", "bash"].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      )}
      <RichText {...props} />
    </div>
  );
}

function RichText({ block, readOnly, pageId, registerRef, onInput, onKeyDown, onPaste }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (last.current !== block.html && el.innerHTML !== block.html) {
      el.innerHTML = block.type === "code" ? block.html : sanitizeHtml(block.html);
    }
    last.current = block.html;
  }, [block.html, block.type]);

  return (
    <div
      ref={(el) => {
        // callback ref: registered during commit, before layout effects run,
        // so focus requests for brand-new blocks find their element
        ref.current = el;
        registerRef(el);
      }}
      className={cx("rich", block.type === "todo" && block.checked && "done")}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={block.type !== "code"}
      data-placeholder={PLACEHOLDER[block.type] ?? ""}
      role="textbox"
      aria-multiline="true"
      aria-label={PLACEHOLDER[block.type] ?? "Bloque"}
      onInput={(e) => {
        const el = e.currentTarget;
        if (el.innerHTML === "<br>") el.innerHTML = "";
        last.current = block.type === "code" ? escapeHtml(el.innerText.replace(/\n$/, "")) : normalize(el.innerHTML);
        onInput(block, el);
      }}
      onKeyDown={(e) => onKeyDown(e, block)}
      onPaste={(e) => onPaste(e, block)}
      onBlur={(e) => {
        // sanitize on blur so stored html stays clean
        if (block.type === "code") return;
        const clean = sanitizeHtml(normalize(e.currentTarget.innerHTML));
        if (clean === block.html) return;
        last.current = clean;
        const st = useStore.getState();
        const owner = st.ws.pages[pageId];
        if (owner) st.setBlocks(pageId, owner.blocks.map((b) => (b.id === block.id ? { ...b, html: clean } : b)));
      }}
    />
  );
}

function ImageBlock({ block, readOnly, onPatch }: { block: Block; readOnly: boolean; onPatch: (id: ID, p: Partial<Block>) => void }) {
  const [url, setUrl] = useState(block.url ?? "");
  if (!block.url) {
    return (
      <div className="block-content image-empty">
        <input
          className="input"
          placeholder="Pega la URL de una imagen (https://…) y pulsa Enter"
          value={url}
          disabled={readOnly}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && /^https?:\/\//.test(url.trim())) onPatch(block.id, { url: url.trim() });
          }}
        />
        <label className="btn ghost sm">
          Subir archivo
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1_500_000) {
                useUI.getState().showToast("La imagen supera 1,5 MB; usa una URL.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => onPatch(block.id, { url: String(reader.result) });
              reader.readAsDataURL(f);
            }}
          />
        </label>
      </div>
    );
  }
  return (
    <div className="block-content">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="block-image" src={block.url} alt="" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// block menu
// ---------------------------------------------------------------------------

function BlockMenu({
  block,
  anchor,
  onClose,
  onTurnInto,
  onColor,
  onDuplicate,
  onMove,
  onDelete,
  onAI,
}: {
  block: Block;
  anchor: Anchor;
  onClose: () => void;
  onTurnInto: (t: BlockType) => void;
  onColor: (c: Block["color"]) => void;
  onDuplicate: () => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onAI: () => void;
}) {
  const [sub, setSub] = useState<"turn" | "color" | null>(null);
  if (!block) return null;
  return (
    <Popover anchor={anchor} onClose={onClose} width={250}>
      {sub === null && (
        <>
          <MenuItem icon={<Sparkles size={15} />} label="Preguntar a la IA" onClick={onAI} />
          <MenuSeparator />
          {TEXT_TYPES.includes(block.type) && (
            <MenuItem icon={<Repeat size={15} />} label="Convertir en" hint="›" onClick={() => setSub("turn")} />
          )}
          <MenuItem icon={<Palette size={15} />} label="Color" hint="›" onClick={() => setSub("color")} />
          <MenuItem icon={<Copy size={15} />} label="Duplicar" hint="⌘D" onClick={onDuplicate} />
          <MenuItem icon={<ArrowUp size={15} />} label="Mover arriba" hint="⌘⇧↑" onClick={() => onMove(-1)} />
          <MenuItem icon={<ArrowDown size={15} />} label="Mover abajo" hint="⌘⇧↓" onClick={() => onMove(1)} />
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 size={15} />} label="Eliminar" hint="Supr" onClick={onDelete} />
        </>
      )}
      {sub === "turn" && (
        <>
          <MenuTitle>Convertir en</MenuTitle>
          {TURN_INTO.map((t) => (
            <MenuItem key={t.id} icon={t.icon} label={t.label} active={block.type === t.blockType} onClick={() => onTurnInto(t.blockType!)} />
          ))}
        </>
      )}
      {sub === "color" && (
        <>
          <MenuTitle>Color del texto</MenuTitle>
          {COLORS.map((c) => (
            <MenuItem
              key={c.id}
              icon={<span className={cx("color-dot", `c-${c.id}`)}>A</span>}
              label={c.name}
              active={(block.color ?? "default") === c.id}
              onClick={() => onColor(c.id)}
            />
          ))}
        </>
      )}
    </Popover>
  );
}
