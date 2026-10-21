import { describe, expect, it } from 'vitest';
import { BLOCKS, getBlockDef } from '@/lib/blocks/catalog';
import { STYLE_FIELDS } from '@/lib/blocks/style-fields';
import { validateBlocks } from '@/lib/blocks/validate';
import { renderMarkdown } from '@/lib/blocks/markdown';
import { PAGE_TEMPLATES } from '@/lib/blocks/templates';
import { fillTemplate } from '@/components/site/blocks/cards';
import { walkFields } from '@/lib/admin/fields';

describe('block catalogue', () => {
  it('has unique types, help text on every field and valid defaults', () => {
    const types = BLOCKS.map((b) => b.type);
    expect(new Set(types).size).toBe(types.length);
    for (const b of BLOCKS) {
      for (const { field, path } of walkFields([...b.fields, ...STYLE_FIELDS])) expect(field.info.length, `${b.type}.${path}`).toBeGreaterThan(5);
      const result = validateBlocks([{ id: 'blk_test01', type: b.type, props: b.defaults, style: b.defaultStyle ?? {} }], { isAdmin: true });
      // Blocks whose required fields have no sensible default (map, video, booking, global section) may fail; the rest must pass.
      if (!['map', 'video', 'bookingLink', 'globalSection', 'countdown'].includes(b.type)) expect(result.ok, b.type).toBe(true);
    }
  });

  it('includes every core block from the specification', () => {
    for (const type of ['section', 'columns', 'tabs', 'accordion', 'spacer', 'divider', 'hero', 'richText', 'imageText', 'quote', 'logoStrip', 'stats', 'countdown', 'cards', 'featureGrid', 'steps', 'timeline', 'team', 'comparison', 'pricingTable', 'gallery', 'video', 'map', 'cta', 'contactForm', 'bookingLink', 'faq', 'customHtml', 'globalSection']) {
      expect(getBlockDef(type), type).toBeDefined();
    }
  });

  it('every page template is valid', () => {
    for (const [id, tpl] of Object.entries(PAGE_TEMPLATES)) expect(validateBlocks(tpl.blocks(), { isAdmin: false }).ok, id).toBe(true);
  });
});

describe('validateBlocks', () => {
  it('rejects unknown types and reports errors by position', () => {
    const r = validateBlocks([{ type: 'nope' }, { type: 'hero', props: { heading: '' } }], { isAdmin: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['blocks.0', 'blocks.1.heading']);
  });

  it('keeps only token style values and assigns ids', () => {
    const r = validateBlocks([{ type: 'richText', props: { content: 'Hi' }, style: { background: 'url(javascript:x)', paddingTop: 'lg', width: 'shell' } }], { isAdmin: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.blocks[0]?.id).toMatch(/^blk_/);
      expect(r.blocks[0]?.style).toEqual({ paddingTop: 'lg', width: 'shell' });
    }
  });

  it('allows containers one level deep only', () => {
    const r = validateBlocks([{ type: 'section', props: {}, children: [{ type: 'columns', props: {}, children: [] }] }], { isAdmin: true });
    expect(r.ok).toBe(false);
  });

  it('stops non-administrators adding custom HTML, but keeps an existing one', () => {
    const existing = [{ id: 'blk_keep01', type: 'customHtml', props: { html: '<b>ok</b>', css: '' }, style: {} }];
    const added = validateBlocks([{ type: 'customHtml', props: { html: '<i>new</i>' } }], { isAdmin: false });
    expect(added.ok && added.blocks.length).toBe(0);
    const kept = validateBlocks([{ id: 'blk_keep01', type: 'customHtml', props: { html: '<i>changed</i>' } }], { isAdmin: false, existing });
    expect(kept.ok && kept.blocks[0]?.props.html).toBe('<b>ok</b>');
  });
});

describe('markdown', () => {
  it('escapes HTML and renders safe formatting', () => {
    const html = renderMarkdown('## Hello\n\n<script>x</script> **bold** [link](javascript:alert(1)) [ok](/about)\n\n- one\n- two');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="#"');
    expect(html).toContain('href="/about"');
    expect(html).toContain('<ul>');
    expect(html).toContain('<h2 id="hello">');
  });
  it('gives non-Latin headings unique fallback ids', () => {
    const html = renderMarkdown('## আমাদের সেবা\n\n## আমাদের সেবা');
    expect(html).toContain('id="h-section"');
    expect(html).toContain('id="h-section-2"');
  });
});

describe('card templates', () => {
  it('escapes values put into owner HTML', () => {
    expect(fillTemplate('<h3>{{title}}</h3><img src="{{image}}">', { title: '<b>x</b>', image: '/a.png" onerror="x' })).toBe('<h3>&lt;b&gt;x&lt;/b&gt;</h3><img src="/a.png&quot; onerror=&quot;x">');
  });
});
