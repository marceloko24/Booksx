/** Caret helpers for contentEditable blocks. Offsets are in text characters. */

export function getSelectionRange(): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
}

export function getCaretOffset(el: HTMLElement): number {
  const range = getSelectionRange();
  if (!range || !el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

export function textLength(el: HTMLElement) {
  return (el.textContent ?? "").length;
}

export function isCaretAtStart(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.isCollapsed) return false;
  return getCaretOffset(el) === 0;
}

export function isCaretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.isCollapsed) return false;
  return getCaretOffset(el) >= textLength(el);
}

export function setCaret(el: HTMLElement, pos: "start" | "end" | number) {
  el.focus({ preventScroll: false });
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (pos === "start" || pos === 0) {
    range.selectNodeContents(el);
    range.collapse(true);
  } else if (pos === "end") {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    let remaining = pos;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    let placed = false;
    while (node) {
      if (remaining <= node.length) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        break;
      }
      remaining -= node.length;
      node = walker.nextNode() as Text | null;
    }
    if (!placed) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Split the element's content at the caret. Returns html before/after. */
export function splitAtCaret(el: HTMLElement): [string, string] {
  const range = getSelectionRange();
  if (!range || !el.contains(range.startContainer)) return [el.innerHTML, ""];
  if (!range.collapsed) range.deleteContents();
  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(range.startContainer, range.startOffset);
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.startContainer, range.startOffset);
  const wrap = (r: Range) => {
    const div = document.createElement("div");
    div.appendChild(r.cloneContents());
    return normalize(div.innerHTML);
  };
  return [wrap(before), wrap(after)];
}

export function normalize(html: string) {
  const h = html.trim();
  if (h === "<br>" || h === "<br/>" || h === "<br />") return "";
  return html;
}

export function caretRect(): DOMRect | null {
  const range = getSelectionRange();
  if (!range) return null;
  const r = range.cloneRange();
  r.collapse(true);
  const rects = r.getClientRects();
  if (rects.length) return rects[0];
  const node = r.startContainer as HTMLElement;
  const el = node.nodeType === 1 ? node : node.parentElement;
  return el ? el.getBoundingClientRect() : null;
}

/** true if caret is on the first visual line of el */
export function caretOnFirstLine(el: HTMLElement) {
  const r = caretRect();
  if (!r || (r.top === 0 && r.bottom === 0)) return true;
  const box = el.getBoundingClientRect();
  return r.top - box.top < (parseFloat(getComputedStyle(el).lineHeight) || 24) * 0.8;
}

export function caretOnLastLine(el: HTMLElement) {
  const r = caretRect();
  if (!r || (r.top === 0 && r.bottom === 0)) return true;
  const box = el.getBoundingClientRect();
  return box.bottom - r.bottom < (parseFloat(getComputedStyle(el).lineHeight) || 24) * 0.8;
}

/** text from the start of el up to the caret */
export function textBeforeCaret(el: HTMLElement) {
  return (el.textContent ?? "").slice(0, getCaretOffset(el));
}

/** delete `count` characters immediately before the caret */
export function deleteBeforeCaret(el: HTMLElement, count: number) {
  const offset = getCaretOffset(el);
  const start = Math.max(0, offset - count);
  selectTextRange(el, start, offset);
  document.execCommand("delete");
}

export function selectTextRange(el: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let pos = 0;
  let startSet = false;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const next = pos + node.length;
    if (!startSet && start <= next) {
      range.setStart(node, start - pos);
      startSet = true;
    }
    if (startSet && end <= next) {
      range.setEnd(node, end - pos);
      break;
    }
    pos = next;
    node = walker.nextNode() as Text | null;
  }
  if (!startSet) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
