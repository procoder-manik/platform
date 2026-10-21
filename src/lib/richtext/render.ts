/**
 * Renders Tiptap JSON to HTML on the server. Only known nodes and marks are output and every value is
 * escaped, so the renderer is also the sanitiser. It also returns the headings for the contents list
 * (unique ids, with a fallback for non-Latin text), the word count and any FAQ section for schema.
 */
import { slugify } from '@/lib/admin/slug';

export interface RtMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface RtNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RtNode[];
  marks?: RtMark[];
  text?: string;
}
export interface Heading {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}
export interface RenderedRichText {
  html: string;
  headings: Heading[];
  words: number;
  readingMinutes: number;
  faq: { question: string; answer: string }[];
}

export const EMPTY_DOC: RtNode = { type: 'doc', content: [{ type: 'paragraph' }] };

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeHref = (href: unknown) => {
  const h = String(href ?? '').trim();
  return /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(h) ? h : null;
};
const safeSrc = (src: unknown) => {
  const s = String(src ?? '').trim();
  return /^(https:\/\/|\/(?!\/))/i.test(s) ? s : null;
};

export function textOf(node: RtNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  return (node.content ?? []).map(textOf).join(node.type === 'doc' || node.type === 'listItem' ? ' ' : '');
}

function youtubeEmbed(src: string): string | null {
  const id = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(src)?.[1];
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

function marksWrap(text: string, marks: RtMark[] = []): string {
  let out = esc(text);
  for (const mark of marks) {
    if (mark.type === 'bold') out = `<strong>${out}</strong>`;
    else if (mark.type === 'italic') out = `<em>${out}</em>`;
    else if (mark.type === 'strike') out = `<s>${out}</s>`;
    else if (mark.type === 'underline') out = `<u>${out}</u>`;
    else if (mark.type === 'code') out = `<code>${out}</code>`;
    else if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (href) out = `<a href="${esc(href)}"${/^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${out}</a>`;
    }
  }
  return out;
}

export function renderRichText(doc: unknown): RenderedRichText {
  const root = (doc && typeof doc === 'object' ? doc : EMPTY_DOC) as RtNode;
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const idFor = (text: string) => {
    const base = slugify(text, 'section');
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  const kids = (n: RtNode) => (n.content ?? []).map(node).join('');
  function node(n: RtNode): string {
    switch (n.type) {
      case 'doc':
        return kids(n);
      case 'text':
        return marksWrap(n.text ?? '', n.marks);
      case 'paragraph': {
        const align = n.attrs?.textAlign === 'center' ? ' style="text-align:center"' : '';
        return `<p${align}>${kids(n)}</p>`;
      }
      case 'heading': {
        // H1 is the title, so body headings are H2 to H4.
        const level = Math.min(4, Math.max(2, Number(n.attrs?.level) || 2)) as 2 | 3 | 4;
        const text = textOf(n).trim();
        const id = idFor(text);
        headings.push({ id, text, level });
        return `<h${level} id="${id}">${kids(n)}</h${level}>`;
      }
      case 'bulletList':
        return `<ul>${kids(n)}</ul>`;
      case 'orderedList': {
        const start = Number(n.attrs?.start) > 1 ? ` start="${Number(n.attrs?.start)}"` : '';
        return `<ol${start}>${kids(n)}</ol>`;
      }
      case 'listItem':
        return `<li>${kids(n)}</li>`;
      case 'blockquote':
        return `<blockquote>${kids(n)}</blockquote>`;
      case 'codeBlock':
        return `<pre><code${n.attrs?.language ? ` class="language-${esc(String(n.attrs.language).replace(/[^\w-]/g, ''))}"` : ''}>${esc(textOf(n))}</code></pre>`;
      case 'hardBreak':
        return '<br />';
      case 'horizontalRule':
        return '<hr />';
      case 'image': {
        const src = safeSrc(n.attrs?.src);
        if (!src) return '';
        const caption = n.attrs?.title ? `<figcaption>${esc(n.attrs.title)}</figcaption>` : '';
        return `<figure><img src="${esc(src)}" alt="${esc(n.attrs?.alt ?? '')}" loading="lazy" decoding="async" />${caption}</figure>`;
      }
      case 'youtube': {
        const src = youtubeEmbed(String(n.attrs?.src ?? ''));
        return src ? `<div class="rt-embed"><iframe src="${src}" title="Video" loading="lazy" allowfullscreen allow="encrypted-media; picture-in-picture"></iframe></div>` : '';
      }
      case 'table':
        return `<div class="rt-table"><table><tbody>${kids(n)}</tbody></table></div>`;
      case 'tableRow':
        return `<tr>${kids(n)}</tr>`;
      case 'tableHeader':
        return `<th scope="col">${kids(n)}</th>`;
      case 'tableCell':
        return `<td>${kids(n)}</td>`;
      case 'callout': {
        const tone = ['info', 'success', 'warning', 'danger'].includes(String(n.attrs?.tone)) ? String(n.attrs?.tone) : 'info';
        return `<aside class="rt-callout" data-tone="${tone}">${kids(n)}</aside>`;
      }
      case 'button': {
        const href = safeHref(n.attrs?.href);
        return href ? `<p><a class="btn btn-primary" href="${esc(href)}">${esc(n.attrs?.label ?? 'Learn more')}</a></p>` : '';
      }
      default:
        // Unknown nodes: keep their text, drop their markup.
        return n.content ? kids(n) : '';
    }
  }

  const html = node(root);
  const words = textOf(root).split(/\s+/).filter(Boolean).length;
  return { html, headings, words, readingMinutes: Math.max(1, Math.round(words / 220)), faq: extractFaq(root) };
}

/** A "Frequently asked questions" (or "FAQ") H2 followed by H3 questions, each answered by the text after it. */
export function extractFaq(doc: RtNode): { question: string; answer: string }[] {
  const nodes = doc.content ?? [];
  const out: { question: string; answer: string }[] = [];
  let inFaq = false;
  let current: { question: string; answer: string[] } | null = null;
  const flush = () => {
    if (current && current.answer.join(' ').trim()) out.push({ question: current.question, answer: current.answer.join(' ').trim() });
    current = null;
  };
  for (const n of nodes) {
    if (n.type === 'heading' && Number(n.attrs?.level) === 2) {
      flush();
      inFaq = /frequently asked questions|^faqs?$|প্রশ্ন/i.test(textOf(n).trim());
      continue;
    }
    if (!inFaq) continue;
    if (n.type === 'heading' && Number(n.attrs?.level) === 3) {
      flush();
      current = { question: textOf(n).trim(), answer: [] };
    } else if (current) current.answer.push(textOf(n));
  }
  flush();
  return out;
}

/** Limits on stored documents, so one post cannot exhaust the database. */
export function checkDoc(value: unknown): string | null {
  if (!value || typeof value !== 'object' || (value as RtNode).type !== 'doc') return 'The text is not in a format the editor understands.';
  const size = JSON.stringify(value).length;
  if (size > 1_500_000) return 'This text is too long. Split it into several posts.';
  return null;
}
