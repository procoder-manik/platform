import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from '@/lib/admin/slug';
import { csvToObjects, parseCsv, toCsv } from '@/lib/admin/csv';
import { parseListQuery, listHref } from '@/lib/admin/query';
import { duplicateData } from '@/lib/admin/duplicate';
import { getPath, isVisible, setPath } from '@/lib/admin/fields';
import { pagesResource, redirectsResource } from '@/modules/core/resources';

describe('slugify', () => {
  it('folds accents and joins words with single hyphens', () => {
    expect(slugify('  Café  & Crème Brûlée!! ')).toBe('cafe-and-creme-brulee');
    expect(slugify('Straße Ærø')).toBe('strasse-aero');
  });
  it('uses the fallback for scripts it cannot spell in Latin letters', () => {
    expect(slugify('আমাদের সেবা', 'page')).toBe('page');
    expect(slugify('Our সেবা services', 'page')).toBe('our-services');
  });
  it('finds the next free slug', () => {
    expect(uniqueSlug('about', new Set(['about', 'about-2']))).toBe('about-3');
    expect(uniqueSlug('new', new Set())).toBe('new');
  });
});

describe('csv', () => {
  it('round-trips quotes, commas and new lines', () => {
    const csv = toCsv(['a', 'b'], [['x, y', 'say "hi"\nthere']]);
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']]);
  });
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(toCsv(['v'], [['=SUM(A1)'], ['-5']])).toBe("v\r\n'=SUM(A1)\r\n-5\r\n");
  });
  it('reads rows as objects and strips a byte order mark', () => {
    expect(csvToObjects('\uFEFFfrom,to\r\n/old,/new\r\n')).toEqual([{ from: '/old', to: '/new' }]);
  });
});

describe('list query', () => {
  it('accepts only sortable columns, known filters and page sizes', () => {
    const q = parseListQuery(pagesResource, { sort: 'passwordHash:asc', f_status: 'PUBLISHED', f_bogus: 'x', size: '999', page: '-3', view: 'trash' });
    expect(q.sort).toEqual(pagesResource.defaultSort);
    expect(q.filters).toEqual({ status: 'PUBLISHED' });
    expect(q.pageSize).toBe(25);
    expect(q.page).toBe(1);
    expect(q.view).toBe('trash');
  });
  it('ignores Trash for resources without it', () => {
    expect(parseListQuery(redirectsResource, { view: 'trash' }).view).toBe('all');
  });
  it('builds short links', () => {
    const q = parseListQuery(pagesResource, {});
    expect(listHref('pages', { page: 2 }, q)).toBe('/admin/pages?sort=updatedAt%3Adesc&page=2');
  });
});

describe('duplicate', () => {
  it('copies as a draft with a unique slug and reset counters', () => {
    const record = { id: '1', title: 'About', slug: 'about', status: 'PUBLISHED', isHome: true, publishAt: new Date(), createdAt: new Date() };
    const data = duplicateData(pagesResource, record, { slug: new Set(['about', 'about-copy']) });
    expect(data).toMatchObject({ title: 'About (copy)', slug: 'about-copy-2', status: 'DRAFT', isHome: false, publishAt: null });
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('createdAt');
  });
  it('suffixes unique paths', () => {
    const data = duplicateData(redirectsResource, { id: '1', from: '/old', to: '/new', hits: 40 }, { from: new Set(['/old']) });
    expect(data).toMatchObject({ from: '/old-copy', hits: 0 });
  });
});

describe('field paths and conditions', () => {
  it('reads and writes nested values without changing the original', () => {
    const record = { seo: { title: 'a' } };
    const next = setPath(record, 'seo.description', 'b');
    expect(next).toEqual({ seo: { title: 'a', description: 'b' } });
    expect(record).toEqual({ seo: { title: 'a' } });
    expect(getPath(next, 'seo.description')).toBe('b');
  });
  it('compares conditions as text', () => {
    const field = { name: 'to', label: 'To', type: 'text' as const, info: 'x', showIf: { field: 'code', notEquals: 410 } };
    expect(isVisible(field, { code: '410' })).toBe(false);
    expect(isVisible(field, { code: 301 })).toBe(true);
  });
});
