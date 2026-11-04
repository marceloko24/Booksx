import type { Block, Page, Workspace } from "./types";
import { newBlock } from "./store";
import { inlineMarkdownToHtml, stripTags } from "./utils";

/** Parse a markdown-ish text into blocks (used for paste and AI output). */
export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim().startsWith("```")) {
      const lang = raw.trim().slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(newBlock({ type: "code", html: escapeCode(code.join("\n")), language: lang || "texto" }));
      continue;
    }
    i++;
    if (!raw.trim()) continue;
    const indentSpaces = raw.match(/^\s*/)?.[0].length ?? 0;
    const indent = Math.min(4, Math.floor(indentSpaces / 2));
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      out.push(newBlock({ type: (`h${m[1].length}` as Block["type"]), html: inlineMarkdownToHtml(m[2]) }));
    } else if ((m = line.match(/^[-*+]\s+\[( |x|X)\]\s+(.*)$/))) {
      out.push(newBlock({ type: "todo", checked: m[1].toLowerCase() === "x", html: inlineMarkdownToHtml(m[2]), indent }));
    } else if ((m = line.match(/^[-*+]\s+(.*)$/))) {
      out.push(newBlock({ type: "bullet", html: inlineMarkdownToHtml(m[1]), indent }));
    } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      out.push(newBlock({ type: "numbered", html: inlineMarkdownToHtml(m[1]), indent }));
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      out.push(newBlock({ type: "quote", html: inlineMarkdownToHtml(m[1]) }));
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      out.push(newBlock({ type: "divider" }));
    } else {
      out.push(newBlock({ type: "paragraph", html: inlineMarkdownToHtml(line), indent }));
    }
  }
  return out;
}

function escapeCode(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlToMd(html: string): string {
  return stripTags(
    html
      .replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**")
      .replace(/<(i|em)>(.*?)<\/\1>/gi, "*$2*")
      .replace(/<code>(.*?)<\/code>/gi, "`$1`")
      .replace(/<(s|strike)>(.*?)<\/\1>/gi, "~~$2~~")
      .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)"),
  );
}

export function blocksToMarkdown(ws: Workspace, blocks: Block[]): string {
  const out: string[] = [];
  let n = 0;
  for (const b of blocks) {
    const pad = "  ".repeat(b.indent || 0);
    const text = htmlToMd(b.html);
    if (b.type !== "numbered") n = 0;
    switch (b.type) {
      case "h1": out.push(`# ${text}`); break;
      case "h2": out.push(`## ${text}`); break;
      case "h3": out.push(`### ${text}`); break;
      case "bullet": out.push(`${pad}- ${text}`); break;
      case "numbered": out.push(`${pad}${++n}. ${text}`); break;
      case "todo": out.push(`${pad}- [${b.checked ? "x" : " "}] ${text}`); break;
      case "toggle": out.push(`${pad}- ${text}`); break;
      case "quote": out.push(`> ${text}`); break;
      case "callout": out.push(`> ${b.emoji ?? "💡"} ${text}`); break;
      case "code": out.push("```" + (b.language ?? ""), stripTags(b.html), "```"); break;
      case "divider": out.push("---"); break;
      case "image": if (b.url) out.push(`![](${b.url})`); break;
      case "page":
      case "database": {
        const p = b.refId ? ws.pages[b.refId] : undefined;
        if (p) out.push(`${pad}- 📄 ${p.title || "Sin título"}`);
        break;
      }
      default: out.push(`${pad}${text}`);
    }
  }
  return out.join("\n");
}

export function pageToMarkdown(ws: Workspace, page: Page): string {
  return `# ${page.title || "Sin título"}\n\n${blocksToMarkdown(ws, page.blocks)}\n`;
}

/** plain text of a page for search and AI context */
export function pagePlainText(page: Page): string {
  return page.blocks.map((b) => stripTags(b.html)).filter(Boolean).join("\n");
}
