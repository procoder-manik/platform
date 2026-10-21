import { describe, expect, it } from 'vitest';
import { renderRichText, extractFaq, type RtNode } from '@/lib/richtext/render';
import { docToMarkdown, markdownToDoc } from '@/lib/richtext/markdown';
import { PRESETS, templateBlocks } from '../../prisma/seed/presets';
import { validateBlocks } from '@/lib/blocks/validate';
import { MODULES } from '@/modules/registry';

const doc = (...content: RtNode[]): RtNode => ({ type: 'doc', content });
const p = (text: string, marks?: RtNode['marks']): RtNode => ({ type: 'paragraph', content: [{ type: 'text', text, marks }] });
const h = (level: number, text: string): RtNode => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });

describe('renderRichText', () => {
  it('escapes text and drops unsafe links and unknown nodes', () => {
    const out = renderRichText(doc(p('<script>alert(1)</script>'), p('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]), { type: 'iframe', attrs: { src: 'https://evil.test' } }, { type: 'image', attrs: { src: 'javascript:x', alt: 'x' } }));
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).not.toMatch(/<script|javascript:|<iframe|<img/);
  });
  it('builds unique heading ids, keeps H1 out of the body and makes non-Latin ids safe', () => {
    const out = renderRichText(doc(h(1, 'Intro'), h(2, 'Intro'), h(3, 'আমাদের সেবা'), h(3, 'আমাদের সেবা')));
    expect(out.headings.map((x) => x.id)).toEqual(['intro', 'intro-2', 'section', 'section-2']);
    expect(out.html).not.toContain('<h1');
  });
  it('renders external links safely, YouTube without cookies, tables and callouts', () => {
    const out = renderRichText(doc(p('site', [{ type: 'link', attrs: { href: 'https://example.com' } }]), { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }, { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p('A')] }] }] }, { type: 'callout', attrs: { tone: 'evil"' }, content: [p('Note')] }));
    expect(out.html).toContain('rel="noopener noreferrer"');
    expect(out.html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(out.html).toContain('<th scope="col">');
    expect(out.html).toContain('data-tone="info"');
  });
  it('counts words and reading time', () => {
    const out = renderRichText(doc(p(Array.from({ length: 660 }, () => 'word').join(' '))));
    expect(out.words).toBe(660);
    expect(out.readingMinutes).toBe(3);
  });
  it('finds an FAQ section', () => {
    const faq = extractFaq(doc(h(2, 'Setup'), p('x'), h(2, 'Frequently asked questions'), h(3, 'How long?'), p('Four weeks.'), h(3, 'Empty?'), h(2, 'After')));
    expect(faq).toEqual([{ question: 'How long?', answer: 'Four weeks.' }]);
  });
});

describe('Markdown', () => {
  it('imports and exports the main structures', () => {
    const d = markdownToDoc('## Title\n\nSome **bold** and [a link](/about).\n\n- one\n- two\n\n> quoted\n\n```\ncode()\n```\n');
    expect(d.content?.map((n) => n.type)).toEqual(['heading', 'paragraph', 'bulletList', 'blockquote', 'codeBlock']);
    const back = docToMarkdown(d);
    for (const part of ['## Title', '**bold**', '[a link](/about)', '- two']) expect(back).toContain(part);
  });
  it('turns an H1 into an H2 because the title is the H1', () => {
    expect(markdownToDoc('# Big').content?.[0]?.attrs?.level).toBe(2);
  });
});

describe('seed presets', () => {
  it('every preset page is valid and every module id exists', () => {
    const ids = MODULES.map((m) => m.id);
    for (const preset of Object.values(PRESETS)) {
      for (const id of Object.keys(preset.modules)) expect(ids, `${preset.id}: ${id}`).toContain(id);
      for (const page of preset.pages) expect(validateBlocks(templateBlocks(page.template, page.extra), { isAdmin: false }).ok, `${preset.id}/${page.slug}`).toBe(true);
    }
  });
});
