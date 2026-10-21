/**
 * Integration tests for the generic admin engine against a real database.
 * Run with DATABASE_URL set to a migrated test database: npm run test. Skipped when it is not set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { bulkAction, duplicateRecord, exportCsv, getRecord, importCsv, listRecords, listRevisions, purgeTrash, restoreRevision, saveRecord } from '@/lib/admin/repo';
import { parseListQuery } from '@/lib/admin/query';
import { mediaUsage } from '@/lib/media/service';
import { pagesResource as pages, redirectsResource as redirects, rolesResource as roles, usersResource as users } from '@/modules/core/resources';
import type { StaffUser } from '@/lib/auth/guards';

const run = Boolean(process.env.DATABASE_URL);
const tag = `t${Date.now().toString(36)}`;
let admin: StaffUser;

describe.skipIf(!run)('admin engine (database)', () => {
  beforeAll(async () => {
    const user = await getDb().user.create({ data: { email: `${tag}@example.test`, kind: 'STAFF', role: 'administrator', name: 'Test admin' } });
    admin = { id: user.id, email: user.email, name: user.name, role: 'administrator', areas: ['*'] };
  });

  afterAll(async () => {
    const db = getDb();
    await db.page.deleteMany({ where: { title: { startsWith: tag } } });
    await db.redirect.deleteMany({ where: { from: { contains: tag } } });
    await db.role.deleteMany({ where: { id: { startsWith: tag } } });
    await db.media.deleteMany({ where: { key: { contains: tag } } });
    await db.user.deleteMany({ where: { email: { contains: tag } } });
  });

  it('creates a page with an automatic slug and reports errors by field', async () => {
    const bad = await saveRecord(pages, null, { title: '', status: 'SCHEDULED' }, admin);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['publishAt', 'title']);

    const ok = await saveRecord(pages, null, { title: `${tag} About us`, status: 'DRAFT' }, admin);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.record.slug).toBe(`${tag}-about-us`);

    const clash = await saveRecord(pages, null, { title: `${tag} other`, slug: `${tag}-about-us`, status: 'DRAFT' }, admin);
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.errors.slug).toMatch(/already used/);
  });

  it('adds a 301 when a live slug changes, without chains or loops', async () => {
    const created = await saveRecord(pages, null, { title: `${tag} Live`, slug: `${tag}-a`, status: 'PUBLISHED' }, admin);
    if (!created.ok) throw new Error('create failed');
    const id = String(created.record.id);
    await saveRecord(pages, id, { ...created.record, slug: `${tag}-b` }, admin);
    await saveRecord(pages, id, { ...(await getRecord(pages, id)), slug: `${tag}-c` }, admin);
    const db = getDb();
    expect((await db.redirect.findUnique({ where: { from: `/${tag}-a` } }))?.to).toBe(`/${tag}-c`);
    expect((await db.redirect.findUnique({ where: { from: `/${tag}-b` } }))?.to).toBe(`/${tag}-c`);
    // Moving back to an old address removes the redirect that would now loop.
    await saveRecord(pages, id, { ...(await getRecord(pages, id)), slug: `${tag}-a` }, admin);
    expect(await db.redirect.findUnique({ where: { from: `/${tag}-a` } })).toBeNull();
  });

  it('quick edit changes only its fields', async () => {
    // Editors send values keyed by field path.
    const created = await saveRecord(pages, null, { title: `${tag} Quick`, status: 'DRAFT', 'seo.description': 'keep me' }, admin);
    if (!created.ok) throw new Error('create failed');
    const id = String(created.record.id);
    const result = await saveRecord(pages, id, { title: `${tag} Quick 2`, 'seo.noindex': true }, admin, { only: pages.quickEdit });
    expect(result.ok).toBe(true);
    const after = await getRecord(pages, id);
    expect(after?.title).toBe(`${tag} Quick 2`);
    expect(after?.seo).toMatchObject({ description: 'keep me', noindex: true });
  });

  it('keeps one home page', async () => {
    const a = await saveRecord(pages, null, { title: `${tag} Home A`, status: 'PUBLISHED', isHome: true }, admin);
    const b = await saveRecord(pages, null, { title: `${tag} Home B`, status: 'PUBLISHED', isHome: true }, admin);
    if (!a.ok || !b.ok) throw new Error('create failed');
    expect((await getRecord(pages, String(a.record.id)))?.isHome).toBe(false);
    expect((await getRecord(pages, String(b.record.id)))?.isHome).toBe(true);
  });

  it('duplicates, trashes, restores and deletes', async () => {
    const created = await saveRecord(pages, null, { title: `${tag} Dup`, status: 'PUBLISHED' }, admin);
    if (!created.ok) throw new Error('create failed');
    const copy = await duplicateRecord(pages, String(created.record.id), admin);
    expect(copy).toMatchObject({ title: `${tag} Dup (copy)`, status: 'DRAFT', slug: `${tag}-dup-copy` });
    const id = String(copy.id);
    await bulkAction(pages, 'trash', [id], admin);
    const trash = await listRecords(pages, parseListQuery(pages, { view: 'trash', q: tag }));
    expect(trash.rows.map((r) => r.id)).toContain(id);
    await expect(bulkAction(pages, 'destroy', [String(created.record.id)], admin)).rejects.toThrow(/Trash/);
    await bulkAction(pages, 'restore', [id], admin);
    expect((await getRecord(pages, id))?.deletedAt).toBeNull();
    await bulkAction(pages, 'trash', [id], admin);
    await bulkAction(pages, 'destroy', [id], admin);
    expect(await getRecord(pages, id)).toBeNull();
  });

  it('stores revisions and restores one', async () => {
    const created = await saveRecord(pages, null, { title: `${tag} Rev v1`, status: 'DRAFT' }, admin);
    if (!created.ok) throw new Error('create failed');
    const id = String(created.record.id);
    await saveRecord(pages, id, { ...created.record, title: `${tag} Rev v2` }, admin);
    const revisions = await listRevisions(pages, id);
    expect(revisions).toHaveLength(2);
    const first = revisions[1];
    if (!first) throw new Error('missing revision');
    const restored = await restoreRevision(pages, id, first.id, admin);
    expect(restored.ok && restored.record.title).toBe(`${tag} Rev v1`);
    expect(await listRevisions(pages, id)).toHaveLength(3);
  });

  it('empties Trash after the retention', async () => {
    const created = await saveRecord(pages, null, { title: `${tag} Old`, status: 'DRAFT' }, admin);
    if (!created.ok) throw new Error('create failed');
    await getDb().page.update({ where: { id: String(created.record.id) }, data: { deletedAt: new Date(Date.now() - 40 * 86_400_000) } });
    const purged = await purgeTrash([pages], 30);
    expect(purged.pages).toBeGreaterThanOrEqual(1);
    expect(await getRecord(pages, String(created.record.id))).toBeNull();
  });

  it('imports and exports redirects as CSV', async () => {
    const csv = `from,to,code,match,active\n/${tag}-x,/new,301,exact,true\n/${tag}-y,/z,410,exact,yes\n${tag}-bad,/q,301,exact,true\n`;
    const report = await importCsv(redirects, csv, admin);
    expect(report.created).toBe(2);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]?.row).toBe(4);
    const again = await importCsv(redirects, `from,to,code,match,active\n/${tag}-x,/newer,302,exact,false\n`, admin);
    expect(again.updated).toBe(1);
    const out = await exportCsv(redirects, null);
    expect(out).toContain(`/${tag}-x,/newer,302,exact,false,0`);
    expect((await getDb().redirect.findUnique({ where: { from: `/${tag}-y` } }))?.to).toBe('');
  });

  it('protects users and roles', async () => {
    const self = await saveRecord(users, admin.id, { email: admin.email, role: 'administrator', blocked: true }, admin);
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.errors.blocked).toMatch(/yourself/);
    const created = await saveRecord(users, null, { email: `${tag}.ed@example.test`, role: 'editor', password: 'a-long-password-1' }, admin);
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.record).not.toHaveProperty('passwordHash');
      const row = await getDb().user.findUnique({ where: { id: String(created.record.id) } });
      expect(row?.kind).toBe('STAFF');
      expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    }
    const builtIn = await saveRecord(roles, null, { id: 'editor', label: 'Fake editor', areas: ['blog'] }, admin);
    expect(builtIn.ok).toBe(false);
    const custom = await saveRecord(roles, null, { id: `${tag}-writer`, label: 'Writer', areas: ['blog', 'media'] }, admin);
    expect(custom.ok).toBe(true);
  });

  it('finds where a file is used', async () => {
    const url = `/api/media/local/${tag}/photo.png`;
    await saveRecord(pages, null, { title: `${tag} Uses media`, status: 'DRAFT', blocks: [{ type: 'imageText', props: { image: url, heading: 'Photo' }, style: {} }] }, admin);
    const usage = await mediaUsage(url);
    expect(usage.map((u) => u.title)).toContain(`${tag} Uses media`);
  });
});
