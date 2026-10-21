/**
 * Pulls what search engines see out of any record: visible text, headings, images, links and FAQ pairs.
 * Works on builder blocks, rich text documents and plain fields, so one scorer and one schema builder serve every type.
 */
import type { Block } from '@/lib/blocks/types';
import { renderMarkdown } from '@/lib/blocks/markdown';
import { renderRichText, type RtNode } from '@/lib/richtext/render';

export interface Extracted {
  text: string;
  words: number;
  headings: { level: number; text: string }[];
  images: { src: string; alt: string | null }[];
  links: string[];
  faq: { question: string; answer: string }[];
  paragraphs: string[];
  lists: number;
  tables: number;
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function fromHtml(html: string, out: Extracted) {
  for (const m of html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/g)) out.headings.push({ level: Number(m[1]), text: stripTags(m[2] as string).trim() });
  for (const m of html.matchAll(/<img[^>]*src="([^"]+)"[^>]*?(?:alt="([^"]*)")?[^>]*>/g)) out.images.push({ src: m[1] as string, alt: m[2] ?? null });
  for (const m of html.matchAll(/<a[^>]*href="([^"]+)"/g)) out.links.push(m[1] as string);
  for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const t = stripTags(m[1] as string).trim();
    if (t) out.paragraphs.push(t);
  }
  out.lists += (html.match(/<(ul|ol)[\s>]/g) ?? []).length;
  out.tables += (html.match(/<table[\s>]/g) ?? []).length;
  out.text += ` ${stripTags(html)}`;
}

function fromDoc(doc: unknown, out: Extracted) {
  if (!doc || typeof doc !== 'object') return;
  const rendered = renderRichText(doc as RtNode);
  // Rich text images carry their own alt text.
  const walk = (n: RtNode) => {
    if (n.type === 'image' && typeof n.attrs?.src === 'string') out.images.push({ src: n.attrs.src, alt: typeof n.attrs.alt === 'string' && n.attrs.alt.trim() ? n.attrs.alt : null });
    n.content?.forEach(walk);
  };
  walk(doc as RtNode);
  const htmlWithoutImages = rendered.html.replace(/<img[^>]*>/g, '');
  fromHtml(htmlWithoutImages, out);
  out.faq.push(...rendered.faq);
}

const TEXT_KEYS = ['heading', 'intro', 'title', 'body', 'quote', 'label', 'question', 'name', 'role', 'value', 'caption', 'tagline'];
const IMAGE_KEYS = ['image', 'cover', 'avatar', 'logo'];

function fromBlocks(blocks: Block[], out: Extracted) {
  for (const b of blocks) {
    if (b.hidden) continue;
    const p = b.props;
    if (typeof p.heading === 'string' && p.heading.trim()) out.headings.push({ level: b.type === 'hero' ? 1 : 2, text: p.heading.trim() });
    const visit = (value: unknown, key: string) => {
      if (typeof value === 'string') {
        if (key === 'content' || key === 'answer') fromHtml(renderMarkdown(value), out);
        else if (IMAGE_KEYS.includes(key) && value) out.images.push({ src: value, alt: null });
        else if (key === 'href' && value) out.links.push(value);
        else if (TEXT_KEYS.includes(key)) {
          out.text += ` ${value}`;
          if (['intro', 'body', 'quote'].includes(key) && value.trim()) out.paragraphs.push(value);
        }
      } else if (Array.isArray(value)) {
        if (key === 'images') value.forEach((src) => typeof src === 'string' && out.images.push({ src, alt: null }));
        else value.forEach((v) => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).forEach(([k, x]) => visit(x, k)) : undefined));
      }
    };
    for (const [k, v] of Object.entries(p)) if (k !== 'heading') visit(v, k);
    if (b.type === 'faq' || b.type === 'accordion') {
      for (const it of Array.isArray(p.items) ? (p.items as Record<string, string>[]) : []) {
        if (b.type === 'faq' && it.question && it.answer) out.faq.push({ question: it.question, answer: it.answer });
      }
      out.lists += 1;
    }
    if (b.type === 'comparison') out.tables += 1;
    if (b.children) fromBlocks(b.children, out);
  }
}

/** Extracts from a record of any content type. Body-like fields are detected by their content. */
export function extractContent(record: Record<string, unknown>): Extracted {
  const out: Extracted = { text: '', words: 0, headings: [], images: [], links: [], faq: [], paragraphs: [], lists: 0, tables: 0 };
  for (const key of ['body', 'problem', 'approach', 'results']) {
    const v = record[key];
    if (v && typeof v === 'object' && (v as RtNode).type === 'doc') fromDoc(v, out);
  }
  for (const key of ['blocks', 'afterBlocks']) if (Array.isArray(record[key])) fromBlocks(record[key] as Block[], out);
  for (const key of ['excerpt', 'summary', 'description', 'tagline']) if (typeof record[key] === 'string') out.text += ` ${record[key] as string}`;
  for (const key of ['cover', 'bannerImage', 'scrollImage', 'logo']) if (typeof record[key] === 'string' && record[key]) out.images.push({ src: record[key] as string, alt: null });
  out.text = out.text.replace(/\s+/g, ' ').trim();
  out.words = out.text ? out.text.split(' ').length : 0;
  return out;
}
