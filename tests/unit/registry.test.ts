import { describe, expect, it } from 'vitest';
import { MODULES } from '@/modules/registry';
import { SETTINGS_GROUPS } from '@/lib/settings/registry';
import { validateRegistry } from '@/lib/modules/logic';
import { toMeta } from '@/lib/modules/types';
import { isArea } from '@/lib/auth/areas';
import { NAV_GROUP_ORDER, buildAdminNav } from '@/lib/admin/nav';
import { RESOURCES } from '@/lib/admin/registry';
import { FIELD_TYPES, walkFields } from '@/lib/admin/fields';

const SPEC_MODULE_IDS = [
  'core', 'blog', 'portfolio', 'caseStudies', 'productsShowcase', 'resume', 'testimonials', 'services',
  'subscriptions', 'store', 'checkout', 'reviews', 'coupons', 'referrals', 'affiliates', 'accounts', 'forms',
  'popups', 'announcement', 'crm', 'knowledge', 'chat', 'aiWriter', 'aiNews', 'newsletter', 'i18n', 'maintenance',
];

describe('module registry', () => {
  it('has no structural problems', () => {
    expect(validateRegistry(MODULES.map(toMeta))).toEqual([]);
  });

  it('contains every module from the specification', () => {
    const ids = MODULES.map((m) => m.id);
    for (const id of SPEC_MODULE_IDS) expect(ids).toContain(id);
  });

  it('keeps core always on and the demo module development only', () => {
    expect(MODULES.find((m) => m.id === 'core')?.alwaysOn).toBe(true);
    expect(MODULES.filter((m) => m.devOnly).map((m) => m.id)).toEqual(['demo']);
  });

  it('uses valid areas and groups in navigation', () => {
    for (const item of MODULES.flatMap((m) => m.navigation)) {
      expect(isArea(item.area)).toBe(true);
      expect(NAV_GROUP_ORDER).toContain(item.group);
      expect(item.href.startsWith('/admin')).toBe(true);
    }
  });

  it('starts every public route with a slash', () => {
    for (const route of MODULES.flatMap((m) => m.routes)) expect(route).toMatch(/^\//);
  });
});

describe('settings registry', () => {
  it('has unique keys', () => {
    const keys = SETTINGS_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every field plain-English help text', () => {
    for (const group of SETTINGS_GROUPS) {
      for (const field of group.fields) {
        expect(field.info.trim().length, `${group.key}.${field.name} needs help text`).toBeGreaterThan(10);
      }
    }
  });

  it('has defaults that pass their own schema', () => {
    for (const group of SETTINGS_GROUPS) {
      expect(group.schema.safeParse(group.defaults).success, group.key).toBe(true);
    }
  });

  it('belongs to known modules and areas', () => {
    const ids = MODULES.map((m) => m.id);
    for (const group of SETTINGS_GROUPS) {
      expect(ids).toContain(group.module);
      expect(isArea(group.area)).toBe(true);
    }
  });
});

describe('resource registry', () => {
  it('has unique ids and plain-English help text on every field, including sub-fields', () => {
    const ids = RESOURCES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RESOURCES) {
      for (const { field, path } of walkFields(r.fields)) {
        expect(field.info.trim().length, `${r.id}.${path} needs help text`).toBeGreaterThan(5);
        expect(FIELD_TYPES).toContain(field.type);
      }
    }
  });

  it('only refers to fields and columns that exist', () => {
    for (const r of RESOURCES) {
      const names = r.fields.map((f) => f.name);
      for (const q of r.quickEdit ?? []) expect(names, `${r.id} quick edit ${q}`).toContain(q);
      if (r.slugField) expect(names).toContain(r.slugField);
      for (const f of r.fields) {
        if (f.showIf) expect(names, `${r.id}.${f.name} condition`).toContain(f.showIf.field);
        if (['select', 'segmented', 'multiselect'].includes(f.type) && !f.optionsFrom) expect(f.options?.length, `${r.id}.${f.name} options`).toBeGreaterThan(0);
      }
      expect(r.columns.some((c) => c.kind === 'title'), `${r.id} needs a title column`).toBe(true);
      expect(isArea(r.area)).toBe(true);
    }
  });

  it('never lists secret columns', () => {
    for (const r of RESOURCES) {
      for (const c of [...r.columns.map((x) => x.field), ...(r.csv?.columns ?? [])]) expect(['passwordHash', 'twoFactorSecret']).not.toContain(c);
    }
  });

  it('builds a menu that respects roles', () => {
    const all = Object.fromEntries(MODULES.map((m) => [m.id, true]));
    const admin = buildAdminNav(all, ['*']).flatMap((g) => g.items.map((i) => i.href));
    const author = buildAdminNav(all, ['overview', 'blog', 'media']).flatMap((g) => g.items.map((i) => i.href));
    expect(admin).toEqual(expect.arrayContaining(['/admin/pages', '/admin/users', '/admin/media', '/admin/settings/site']));
    expect(author).toContain('/admin/media');
    expect(author).not.toContain('/admin/users');
    expect(author).not.toContain('/admin/modules');
  });
});
