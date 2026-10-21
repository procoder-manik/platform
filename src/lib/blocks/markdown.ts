/**
 * A small, safe Markdown renderer for block text: paragraphs, ## to #### headings, **bold**, *italic*,
 * `code`, [links](/path), "- " and "1. " lists and "> " quotes. Everything is escaped first, so no HTML
 * from the owner reaches the page. Headings get ids for anchor links, with a fallback for non-Latin text.
 */
import { slugify } from '@/lib/admin/slug';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(text: string): string {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
      const safe = /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(href) ? href : '#';
      const external = /^https?:\/\//i.test(safe);
      return `<a href="${safe}"${external ? ' rel="noopener noreferrer" target="_blank"' : ''}>${label}</a>`;
    });
}

export function renderMarkdown(source: string, idPrefix = 'h'): string {
  const lines = (source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const used = new Map<string, number>();
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br />')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const headingId = (text: string) => {
    const base = slugify(text, `${idPrefix}-section`);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{2,4})\s+(.+)$/.exec(line);
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const level = (h[1] as string).length;
      const text = (h[2] as string).trim();
      out.push(`<h${level} id="${headingId(text)}">${inline(text)}</h${level}>`);
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        flushList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(((ul ?? ol) as RegExpExecArray)[1] as string)}</li>`);
    } else if (quote) {
      flushPara();
      flushList();
      out.push(`<blockquote><p>${inline(quote[1] as string)}</p></blockquote>`);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}
