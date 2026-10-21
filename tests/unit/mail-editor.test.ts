import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATES, PLACEHOLDERS, TEMPLATE_GROUP, placeholdersIn, sampleVarsFor, unknownPlaceholders, type TemplateId } from '@/lib/mail/templates';
import { fill } from '@/lib/mail/templates';
import { emailBrand, renderEmail } from '@/lib/mail/render';
import { brandSettings } from '@/lib/theme/brand';

const ids = Object.keys(EMAIL_TEMPLATES) as TemplateId[];
const brand = emailBrand(brandSettings.defaults, 'Northlight', 'https://example.com');

describe('placeholdersIn', () => {
  it('finds only the placeholders actually used, in first-seen order with no duplicates', () => {
    expect(placeholdersIn('Hi {name}, order {number} for {name}')).toEqual(['name', 'number']);
    expect(placeholdersIn('no placeholders here')).toEqual([]);
  });
  it('never returns an unknown token', () => {
    expect(placeholdersIn('{name} and {nonsense}')).toEqual(['name']);
  });
});

describe('TEMPLATE_GROUP', () => {
  it('assigns every template id to exactly one group', () => {
    for (const id of ids) expect(typeof TEMPLATE_GROUP[id], id).toBe('string');
    expect(Object.keys(TEMPLATE_GROUP).sort()).toEqual([...ids].sort());
  });
  it('sends owner templates to the owner group and nothing else there', () => {
    for (const id of ids) {
      const owner = EMAIL_TEMPLATES[id].to === 'owner';
      expect(TEMPLATE_GROUP[id] === 'Alerts to you', id).toBe(owner);
    }
  });
});

describe('sampleVarsFor', () => {
  it('gives a sample for every placeholder a template uses, and nothing more', () => {
    for (const id of ids) {
      const used = placeholdersIn(`${EMAIL_TEMPLATES[id].subject} ${EMAIL_TEMPLATES[id].body}`);
      const sample = sampleVarsFor(id);
      expect(Object.keys(sample).sort(), id).toEqual([...used].sort());
      for (const p of used) expect(sample[p], `${id}.${p}`).toBeTruthy();
    }
  });
  it('fills a template completely so the preview never shows a bare {placeholder}', () => {
    for (const id of ids) {
      const t = EMAIL_TEMPLATES[id];
      const filled = fill(`${t.subject} ${t.body}`, sampleVarsFor(id));
      expect(filled, id).not.toMatch(/\{[a-z_]+\}/);
    }
  });
  it('covers every declared placeholder across all templates combined', () => {
    const covered = new Set(ids.flatMap((id) => placeholdersIn(`${EMAIL_TEMPLATES[id].subject} ${EMAIL_TEMPLATES[id].body}`)));
    expect([...covered].sort()).toEqual([...PLACEHOLDERS].sort());
  });
});

describe('renderEmail with an edited template', () => {
  it('renders saved-looking text the same way as a code default', () => {
    const edited = { subject: 'Thanks, {name}!', body: 'Your order {number} is on its way.\n\nCheers.', cta: 'Track it' };
    const out = renderEmail(edited, { name: 'Sam', number: 'WL-1', link: 'https://example.com/o/1' }, brand);
    expect(out.subject).toBe('Thanks, Sam!');
    expect(out.html).toContain('Track it');
    expect(out.text).toContain('Track it: https://example.com/o/1');
  });
  it('still escapes HTML in edited text', () => {
    const out = renderEmail({ subject: 'Hi', body: '<script>alert(1)</script> {name}' }, { name: '<b>x</b>' }, brand);
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });
});

describe('unknownPlaceholders still catches typos in edited text', () => {
  it('flags a placeholder nobody declared', () => {
    expect(unknownPlaceholders('Hi {nmae}, your order {number}')).toEqual(['nmae']);
    expect(unknownPlaceholders('Hi {name}, order {number}, {total}')).toEqual([]);
  });
});
