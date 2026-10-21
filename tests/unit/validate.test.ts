import { describe, expect, it } from 'vitest';
import { validateValues } from '@/lib/admin/validate';
import type { FieldDef } from '@/lib/admin/fields';
import { pagesResource, redirectsResource } from '@/modules/core/resources';

const f = (field: Partial<FieldDef> & Pick<FieldDef, 'name' | 'type'>): FieldDef => ({ label: field.name, info: 'Help text for this field.', ...field });

describe('validateValues', () => {
  it('reports required fields by name and keeps going', () => {
    const r = validateValues([f({ name: 'title', type: 'text', required: true }), f({ name: 'email', type: 'email' })], { title: '', email: 'nope' }, { isAdmin: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'title']);
  });

  it('clears blank optional values', () => {
    const r = validateValues([f({ name: 'n', type: 'number' }), f({ name: 'tags', type: 'tags' }), f({ name: 'on', type: 'switch' })], { n: '', tags: [], on: undefined }, { isAdmin: true });
    expect(r).toEqual({ ok: true, values: { n: null, tags: [], on: false } });
  });

  it('coerces and checks types', () => {
    const fields = [
      f({ name: 'price', type: 'money' }),
      f({ name: 'when', type: 'datetime' }),
      f({ name: 'colour', type: 'color' }),
      f({ name: 'code', type: 'select', numeric: true, options: [{ value: '301', label: '301' }] }),
      f({ name: 'data', type: 'json' }),
    ];
    const r = validateValues(fields, { price: '1999', when: '2026-10-18T10:00:00.000Z', colour: '#abc', code: '301', data: '{"a":1}' }, { isAdmin: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.price).toBe(1999);
      expect(r.values.when).toBeInstanceOf(Date);
      expect(r.values.code).toBe(301);
      expect(r.values.data).toEqual({ a: 1 });
    }
    const bad = validateValues(fields, { price: '-1', colour: 'red', code: '999', data: '{' }, { isAdmin: true });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['code', 'colour', 'data', 'price']);
  });

  it('skips admin-only fields for other roles and read-only fields for everyone', () => {
    const fields = [...pagesResource.fields, f({ name: 'headCode', type: 'code', adminOnly: true })];
    const r = validateValues(fields, { title: 'A', slug: 'a', status: 'DRAFT', headCode: '<script>x</script>' }, { isAdmin: false });
    expect(r.ok && 'headCode' in r.values).toBe(false);
    const red = validateValues(redirectsResource.fields, { from: '/a', to: '/b', code: '301', match: 'exact', active: true, hits: 999 }, { isAdmin: true });
    expect(red.ok && 'hits' in red.values).toBe(false);
  });

  it('skips hidden fields', () => {
    const r = validateValues(redirectsResource.fields, { from: '/gone', code: '410', match: 'exact', active: true }, { isAdmin: true });
    expect(r.ok).toBe(true);
  });

  it('validates only quick-edit fields when asked', () => {
    const r = validateValues(pagesResource.fields, { title: 'New', status: 'DRAFT', slug: 'x' }, { isAdmin: true, only: ['title'] });
    expect(r).toEqual({ ok: true, values: { title: 'New' } });
  });

  it('validates repeater rows and reports errors with the row number', () => {
    const field = f({ name: 'items', type: 'repeater', fields: [f({ name: 'label', type: 'text', required: true }), f({ name: 'url', type: 'url' })] });
    const r = validateValues([field], { items: [{ label: 'A', url: '/a' }, { label: '', url: 'nope' }] }, { isAdmin: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['items.1.label', 'items.1.url']);
  });

  it('keeps an empty password as "no change"', () => {
    const r = validateValues([f({ name: 'password', type: 'password' })], { password: '' }, { isAdmin: true });
    expect(r).toEqual({ ok: true, values: {} });
    const short = validateValues([f({ name: 'password', type: 'password' })], { password: 'short' }, { isAdmin: true });
    expect(short.ok).toBe(false);
  });

  it('turns blank optional text inside repeater rows into an empty string, so text schemas accept it', () => {
    const field = f({ name: 'rows', type: 'repeater', fields: [f({ name: 'label', type: 'text', required: true }), f({ name: 'details', type: 'textarea' }), f({ name: 'on', type: 'switch' }), f({ name: 'tags', type: 'tags' })] });
    const r = validateValues([field], { rows: [{ label: 'A', details: '' }] }, { isAdmin: true });
    expect(r).toEqual({ ok: true, values: { rows: [{ label: 'A', details: '', on: false, tags: [] }] } });
    // At the top level blank still means "nothing" (null), which database columns store.
    expect(validateValues([f({ name: 'details', type: 'textarea' })], { details: '' }, { isAdmin: true })).toEqual({ ok: true, values: { details: null } });
  });
});
