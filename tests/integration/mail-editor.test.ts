/**
 * Email template overrides against a real database: saving, resetting, the override actually being used when
 * sending, placeholder validation, and that overriding one template never touches another. Runs when
 * DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const sent: { to: string; subject: string; text: string; html: string }[] = [];
vi.mock('@/lib/adapters/mail', () => ({ getMail: () => ({ id: 'test', send: async (m: { to: string; subject: string; text: string; html: string }) => { sent.push(m); return { ok: true }; } }) }));

import { getDb } from '@/lib/db';
import { resetTemplate, resolvedTemplate, saveTemplate } from '@/lib/mail/overrides';
import { sendTemplate } from '@/lib/mail/send';
import { HttpError } from '@/lib/http/errors';
import { EMAIL_TEMPLATES } from '@/lib/mail/templates';

const run = Boolean(process.env.DATABASE_URL);
let by = { id: '', name: 'Tester' };
const refuses = async (p: Promise<unknown>, text: RegExp) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, 'should have been refused').toBeInstanceOf(HttpError);
  expect((e as HttpError).message).toMatch(text);
};

describe.skipIf(!run)('email template overrides (database)', () => {
  beforeAll(async () => {
    const staff = await getDb().user.create({ data: { email: `editor-${Date.now()}@staff.test`, kind: 'STAFF', role: 'administrator', name: 'Tester' } });
    by = { id: staff.id, name: 'Tester' };
    await getDb().emailTemplateOverride.deleteMany({ where: { templateId: { in: ['order.received', 'order.paid', 'owner.paid'] } } });
  });
  afterAll(async () => {
    await getDb().emailTemplateOverride.deleteMany({ where: { templateId: { in: ['order.received', 'order.paid', 'owner.paid'] } } });
    await getDb().emailLog.deleteMany({ where: { to: 'test@editor.test' } });
    await getDb().auditLog.deleteMany({ where: { userId: by.id } });
    await getDb().user.deleteMany({ where: { id: by.id } });
  });

  it('falls back to the code default until something is saved', async () => {
    expect(await resolvedTemplate('order.received')).toEqual(EMAIL_TEMPLATES['order.received']);
  });

  it('saves custom wording and uses it both for resolving and for an actual send', async () => {
    await saveTemplate('order.received', 'Thanks for ordering, {name}!', 'Hi {name}, order {number} received. Total {total}.', by);
    const t = await resolvedTemplate('order.received');
    expect(t.subject).toBe('Thanks for ordering, {name}!');
    expect(t.cta).toBe(EMAIL_TEMPLATES['order.received'].cta);

    const ok = await sendTemplate('order.received', 'test@editor.test', { name: 'Sam', number: 'WL-1', total: '$10.00' }, { entity: 'order', entityId: 'x1' });
    expect(ok).toBe(true);
    const mail = sent.at(-1);
    expect(mail?.subject).toBe('Thanks for ordering, Sam!');
    expect(mail?.text).toContain('order WL-1 received');
    const row = await getDb().emailTemplateOverride.findUniqueOrThrow({ where: { templateId: 'order.received' } });
    expect(row.updatedBy).toBe('Tester');
  });

  it('refuses a placeholder nobody declared, and other bad input, leaving the saved text alone', async () => {
    await refuses(saveTemplate('order.received', 'Hi {nmae}', 'Body text here.', by), /not recognised/);
    await refuses(saveTemplate('order.received', '', 'Body text here.', by), /subject/);
    await refuses(saveTemplate('order.received', 'Subject', '', by), /email text/);
    await refuses(saveTemplate('order.received', 'x'.repeat(201), 'Body', by), /200 characters/);
    await refuses(saveTemplate('not.a.real.id' as never, 'Subject', 'Body', by), /does not exist/);
    expect((await resolvedTemplate('order.received')).subject).toBe('Thanks for ordering, {name}!');
  });

  it('resets to the code default and that is what gets used next', async () => {
    await resetTemplate('order.received', by);
    expect(await getDb().emailTemplateOverride.findUnique({ where: { templateId: 'order.received' } })).toBeNull();
    expect(await resolvedTemplate('order.received')).toEqual(EMAIL_TEMPLATES['order.received']);
  });

  it('overriding one template never changes another', async () => {
    await saveTemplate('order.paid', 'Paid: {number}', 'Paid body.', by);
    expect((await resolvedTemplate('owner.paid'))).toEqual(EMAIL_TEMPLATES['owner.paid']);
    expect((await resolvedTemplate('order.paid')).subject).toBe('Paid: {number}');
  });
});
