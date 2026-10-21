/**
 * Customer accounts against a real database: sign-up, one-time links, sign-in, password changes, claiming
 * guest orders, addresses, wishlist, data export and deletion. Runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
const sent: { to: string; subject: string; text: string }[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) as string } : undefined), set: (n: string, v: string) => void jar.set(n, v), delete: (n: string) => void jar.delete(n) }),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/adapters/mail', () => ({
  getMail: () => ({ id: 'test', send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { ok: true }; } }),
}));

import { getDb } from '@/lib/db';
import { saveSetting } from '@/lib/settings/store';
import { saveModuleChoices } from '@/lib/modules/server';
import { paymentSettings } from '@/lib/checkout/settings';
import { markOrderPaid, placeServiceOrder } from '@/lib/checkout/orders';
import { hashPassword } from '@/lib/auth/password';
import { changePassword, deleteAddress, deleteCustomerAccount, exportCustomerData, getCustomer, listAddresses, loginCustomer, registerCustomer, requestMagicLink, requestPasswordReset, resetPassword, saveAddress, signInWithLink, signOutCustomer, toggleWishlist, verifyEmail, accountSummary, type Customer } from '@/lib/accounts/engine';
import { HttpError } from '@/lib/http/errors';

const run = Boolean(process.env.DATABASE_URL);
const tag = `a${Date.now().toString(36)}`;
const mail = (s: string) => `${tag}.${s}@acct.test`;
const meta = (ip = '10.0.0.1') => ({ ip, userAgent: 'vitest' });
const GOOD = 'correct horse battery';
const address = { name: 'Sam', line1: '1 High St', city: 'Dhaka', country: 'BD', phone: '+8801700000000' };
const previous: Record<string, unknown> = {};
let productId = '';

const refuses = async (p: Promise<unknown>, text: RegExp) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, 'should have been refused').toBeInstanceOf(HttpError);
  expect((e as HttpError).message).toMatch(text);
};
/** The link token from the last email to an address. */
const linkFor = (to: string, kind: 'verify' | 'reset' | 'magic') => {
  const m = [...sent].reverse().find((x) => x.to === to && x.text.includes(`/account/${kind}/`));
  return m?.text.match(new RegExp(`/account/${kind}/([A-Za-z0-9_-]+)`))?.[1] ?? '';
};
const user = (s: string) => getDb().user.findUniqueOrThrow({ where: { email: mail(s) } });
const customerOf = async (s: string): Promise<Customer> => {
  jar.clear();
  await loginCustomer(mail(s), GOOD, meta(`10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`));
  return (await getCustomer()) as Customer;
};
/** An account that is ready to use. */
async function makeAccount(s: string, verified = true) {
  return getDb().user.create({ data: { email: mail(s), name: s, kind: 'CUSTOMER', passwordHash: await hashPassword(GOOD), emailVerified: verified ? new Date() : null } });
}

describe.skipIf(!run)('customer accounts (database)', () => {
  beforeAll(async () => {
    const db = getDb();
    for (const key of ['payments', 'modules']) previous[key] = (await db.setting.findUnique({ where: { key } }))?.data ?? null;
    await saveSetting(paymentSettings, { currency: 'USD', localCurrency: '', localRate: null, orderPrefix: 'TS', invoicePrefix: 'TSI', taxRatePct: 0, taxInclusive: false, ownerEmail: 'owner@acct.test', methods: [{ id: 'bkash', enabled: true, label: 'bKash', details: 'x', testMode: true }] });
    await saveModuleChoices({ services: true, checkout: true, store: true, accounts: true, subscriptions: true });
    const svc = await db.service.create({ data: { name: 'Care', slug: `${tag}-svc`, active: true } });
    await db.package.create({ data: { serviceId: svc.id, name: 'Pro', slug: `${tag}-pro`, price: 10_000, currency: 'USD', features: [] } });
    productId = (await db.storeProduct.create({ data: { name: 'Mug', slug: `${tag}-mug`, status: 'PUBLISHED', price: 1000, currency: 'USD' } })).id;
    await db.storeProduct.create({ data: { name: 'Draft', slug: `${tag}-draft`, status: 'DRAFT', price: 1000, currency: 'USD' } });
  });
  beforeEach(() => jar.clear());

  afterAll(async () => {
    const db = getDb();
    await db.order.deleteMany({ where: { email: { endsWith: '@acct.test' } } });
    await db.subscription.deleteMany({ where: { email: { endsWith: '@acct.test' } } });
    await db.user.deleteMany({ where: { email: { endsWith: '@acct.test' } } });
    await db.verificationToken.deleteMany({ where: { identifier: { endsWith: '@acct.test' } } });
    await db.storeProduct.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.package.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.service.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.emailLog.deleteMany({ where: { to: { endsWith: '@acct.test' } } });
    for (const [key, data] of Object.entries(previous)) {
      if (data === null) await db.setting.deleteMany({ where: { key } });
      else await db.setting.update({ where: { key }, data: { data: data as object } });
    }
  });

  it('creates an account and asks for confirmation, answering the same way for known addresses', async () => {
    await registerCustomer({ name: 'Ann', email: ` ${mail('ann').toUpperCase()} `, password: GOOD }, meta());
    const u = await user('ann');
    expect(u).toMatchObject({ kind: 'CUSTOMER', name: 'Ann', emailVerified: null });
    expect(u.passwordHash).toMatch(/^\$argon2id/);
    expect(sent.some((m) => m.to === mail('ann') && /Confirm your email/.test(m.subject))).toBe(true);
    expect(linkFor(mail('ann'), 'verify').length).toBeGreaterThan(30);

    const before = sent.length;
    await registerCustomer({ name: 'Other', email: mail('ann'), password: 'another good one' }, meta());
    expect(sent.slice(before).map((m) => m.subject)).toEqual(['You already have an account']);
    expect((await user('ann')).name).toBe('Ann');

    const staff = await getDb().user.create({ data: { email: mail('staffer'), kind: 'STAFF', role: 'administrator', name: 'Boss', passwordHash: await hashPassword(GOOD) } });
    const n = sent.length;
    await registerCustomer({ name: 'Imposter', email: mail('staffer'), password: 'another good one' }, meta());
    expect(sent.length).toBe(n);
    expect((await getDb().user.findUniqueOrThrow({ where: { id: staff.id } })).kind).toBe('STAFF');
  });

  it('refuses weak or incomplete sign-ups with a reason', async () => {
    await refuses(registerCustomer({ name: '', email: mail('x1'), password: GOOD }, meta()), /name/);
    await refuses(registerCustomer({ name: 'X', email: 'nope', password: GOOD }, meta()), /valid email/);
    await refuses(registerCustomer({ name: 'X', email: mail('x2'), password: 'short' }, meta()), /at least 10/);
    await refuses(registerCustomer({ name: 'X', email: mail('x3'), password: 'password123' }, meta()), /too common/);
    expect(await getDb().user.count({ where: { email: { in: [mail('x1'), mail('x2'), mail('x3')] } } })).toBe(0);
  });

  it('signs in with the right password only, and keeps staff and blocked people out', async () => {
    await makeAccount('bob');
    await refuses(loginCustomer(mail('bob'), 'wrong password here', meta('10.2.0.1')), /not right/);
    await refuses(loginCustomer(mail('nobody'), GOOD, meta('10.2.0.2')), /not right/);
    await refuses(loginCustomer(mail('staffer'), GOOD, meta('10.2.0.3')), /not right/);
    expect(await getCustomer()).toBeNull();

    await loginCustomer(mail('bob'), GOOD, meta('10.2.0.4'));
    const c = await getCustomer();
    expect(c).toMatchObject({ email: mail('bob'), verified: true });
    expect((await user('bob')).lastLoginAt).not.toBeNull();

    await getDb().user.update({ where: { email: mail('bob') }, data: { blocked: true } });
    expect(await getCustomer()).toBeNull();
    await refuses(loginCustomer(mail('bob'), GOOD, meta('10.2.0.5')), /not right/);
    await getDb().user.update({ where: { email: mail('bob') }, data: { blocked: false } });
  });

  it('slows guessing: the sixth try for one address is refused even with the right password', async () => {
    await makeAccount('cal');
    for (let i = 0; i < 5; i += 1) await refuses(loginCustomer(mail('cal'), `wrong password ${i}`, meta('10.3.0.1')), /not right/);
    await refuses(loginCustomer(mail('cal'), GOOD, meta('10.3.0.2')), /Too many/);
  });

  it('ends a session when it expires or the person signs out', async () => {
    await makeAccount('dee');
    await loginCustomer(mail('dee'), GOOD, meta('10.4.0.1'));
    const token = jar.get('cs') as string;
    await getDb().session.update({ where: { sessionToken: token }, data: { expires: new Date(Date.now() - 1000) } });
    expect(await getCustomer()).toBeNull();
    await loginCustomer(mail('dee'), GOOD, meta('10.4.0.2'));
    expect(await getCustomer()).not.toBeNull();
    await signOutCustomer();
    expect(await getCustomer()).toBeNull();
    expect(jar.has('cs')).toBe(false);
  });

  it('confirming the email once links earlier guest orders and plans of that address, and no one else’s', async () => {
    const db = getDb();
    const guest = await placeServiceOrder({ packageSlug: `${tag}-pro`, name: 'Eve', email: mail('eve'), phone: '', requirements: {}, methodId: 'bkash' });
    const other = await placeServiceOrder({ packageSlug: `${tag}-pro`, name: 'Zed', email: mail('zed'), phone: '', requirements: {}, methodId: 'bkash' });
    await markOrderPaid(guest.id, 'test');
    await registerCustomer({ name: 'Eve', email: mail('eve'), password: GOOD }, meta('10.5.0.1'));
    expect((await db.order.findUniqueOrThrow({ where: { id: guest.id } })).userId).toBeNull();

    const token = linkFor(mail('eve'), 'verify');
    expect(await verifyEmail('x'.repeat(43))).toBe(false);
    expect(await verifyEmail(token)).toBe(true);
    expect(await verifyEmail(token)).toBe(false);
    const eve = await user('eve');
    expect(eve.emailVerified).not.toBeNull();
    expect((await db.order.findUniqueOrThrow({ where: { id: guest.id } })).userId).toBe(eve.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: other.id } })).userId).toBeNull();
  });

  it('refuses an expired confirmation link', async () => {
    await registerCustomer({ name: 'Fay', email: mail('fay'), password: GOOD }, meta('10.6.0.1'));
    const token = linkFor(mail('fay'), 'verify');
    await getDb().verificationToken.updateMany({ where: { identifier: `verify:${mail('fay')}` }, data: { expires: new Date(Date.now() - 1000) } });
    expect(await verifyEmail(token)).toBe(false);
    expect((await user('fay')).emailVerified).toBeNull();
  });

  it('resets a password once, signs out every device and checks the new password', async () => {
    await makeAccount('gus');
    await loginCustomer(mail('gus'), GOOD, meta('10.7.0.1'));
    const sessionBefore = await getDb().session.count({ where: { userId: (await user('gus')).id } });
    expect(sessionBefore).toBe(1);

    await requestPasswordReset(mail('gus'), meta('10.7.0.2'));
    const token = linkFor(mail('gus'), 'reset');
    expect(token.length).toBeGreaterThan(30);
    await refuses(resetPassword(token, 'short', meta()), /at least 10/);
    await resetPassword(token, 'a brand new passphrase', meta());
    await refuses(resetPassword(token, 'another passphrase here', meta()), /expired or was already used/);
    expect(await getDb().session.count({ where: { userId: (await user('gus')).id } })).toBe(0);
    await refuses(loginCustomer(mail('gus'), GOOD, meta('10.7.0.3')), /not right/);
    await loginCustomer(mail('gus'), 'a brand new passphrase', meta('10.7.0.4'));
    expect(sent.some((m) => m.to === mail('gus') && /password was changed/i.test(m.subject))).toBe(true);
  });

  it('says nothing about unknown or staff addresses when asked for a reset or sign-in link', async () => {
    const n = sent.length;
    await requestPasswordReset(mail('ghost'), meta('10.8.0.1'));
    await requestMagicLink(mail('ghost'), meta('10.8.0.1'));
    await requestPasswordReset(mail('staffer'), meta('10.8.0.1'));
    await requestMagicLink('not-an-email', meta('10.8.0.1'));
    expect(sent.length).toBe(n);
  });

  it('signs in with an emailed link once, and that also confirms the address', async () => {
    await makeAccount('hal', false);
    await requestMagicLink(mail('hal'), meta('10.9.0.1'));
    const token = linkFor(mail('hal'), 'magic');
    expect(await signInWithLink('y'.repeat(43), meta())).toBe(false);
    expect(await signInWithLink(token, meta('10.9.0.2'))).toBe(true);
    expect(await getCustomer()).toMatchObject({ email: mail('hal'), verified: true });
    jar.clear();
    expect(await signInWithLink(token, meta())).toBe(false);
    expect(await getCustomer()).toBeNull();
  });

  it('changes a password after checking the old one, and signs out the other devices only', async () => {
    await makeAccount('ivy');
    const first = await customerOf('ivy');
    const mine = first.sessionToken;
    await getDb().session.create({ data: { sessionToken: `other-${tag}-${'z'.repeat(30)}`, userId: first.id, expires: new Date(Date.now() + 1e9) } });
    await refuses(changePassword(first, 'not my password at all', 'a brand new passphrase'), /current password/);
    await refuses(changePassword(first, GOOD, 'short'), /at least 10/);
    await changePassword(first, GOOD, 'a brand new passphrase');
    const rows = await getDb().session.findMany({ where: { userId: first.id } });
    expect(rows.map((r) => r.sessionToken)).toEqual([mine]);
  });

  it('saves addresses for the owner only, with one default', async () => {
    await makeAccount('jon');
    await makeAccount('kim');
    const jon = await customerOf('jon');
    await saveAddress(jon, { address, label: 'Home' });
    await saveAddress(jon, { address: { ...address, line1: '2 Low Rd' }, label: 'Office', isDefault: true });
    let list = await listAddresses(jon.id);
    expect(list.map((a) => [a.label, a.isDefault])).toEqual([['Office', true], ['Home', false]]);

    const kim = await customerOf('kim');
    await refuses(saveAddress(kim, { id: list[0]!.id, address }), /no longer exists/);
    await deleteAddress(kim, list[0]!.id);
    expect(await listAddresses(jon.id)).toHaveLength(2);

    await deleteAddress(jon, list[0]!.id);
    list = await listAddresses(jon.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: 'Home', isDefault: true });
    await refuses(saveAddress(jon, { address: { ...address, country: 'ZZ' } }), /country/i);
    await refuses(saveAddress(jon, { address: { ...address, phone: '1' } }), /phone/i);
    for (let i = 0; i < 9; i += 1) await saveAddress(jon, { address });
    await refuses(saveAddress(jon, { address }), /up to 10/);
  });

  it('saves and removes wishlist items, and only for published products', async () => {
    await makeAccount('lee');
    const lee = await customerOf('lee');
    expect(await toggleWishlist(lee, productId)).toBe(true);
    expect(await getDb().wishlistItem.count({ where: { userId: lee.id } })).toBe(1);
    expect(await toggleWishlist(lee, productId)).toBe(false);
    expect(await getDb().wishlistItem.count({ where: { userId: lee.id } })).toBe(0);
    const draft = await getDb().storeProduct.findFirstOrThrow({ where: { slug: `${tag}-draft` } });
    await refuses(toggleWishlist(lee, draft.id), /not available/);
    await refuses(toggleWishlist(lee, 'does-not-exist'), /not available/);
  });

  it('shows a customer their own orders and plans only', async () => {
    await makeAccount('max');
    const max = await customerOf('max');
    const mine = await placeServiceOrder({ packageSlug: `${tag}-pro`, name: 'Max', email: mail('max'), phone: '', requirements: {}, methodId: 'bkash', userId: max.id });
    await placeServiceOrder({ packageSlug: `${tag}-pro`, name: 'Zed', email: mail('zed'), phone: '', requirements: {}, methodId: 'bkash' });
    const s = await accountSummary(max);
    expect(s.orders.map((o) => o.id)).toEqual([mine.id]);
  });

  it('exports a customer’s data, and deleting the account keeps the orders but unlinks them', async () => {
    const db = getDb();
    await makeAccount('ned');
    const ned = await customerOf('ned');
    await saveAddress(ned, { address });
    await toggleWishlist(ned, productId);
    const order = await placeServiceOrder({ packageSlug: `${tag}-pro`, name: 'Ned', email: mail('ned'), phone: '', requirements: {}, methodId: 'bkash', userId: ned.id });

    const data = await exportCustomerData(ned);
    expect(data.account).toMatchObject({ email: mail('ned'), name: 'ned' });
    expect(data.addresses).toHaveLength(1);
    expect(data.wishlist[0]).toMatchObject({ product: 'Mug' });
    expect(data.orders[0]).toMatchObject({ number: order.number, total: 10_000 });
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|argon2/);

    await refuses(deleteCustomerAccount(ned, 'not the password at all'), /password is not right/);
    expect(await db.user.count({ where: { id: ned.id } })).toBe(1);
    await deleteCustomerAccount(ned, GOOD);
    expect(await db.user.count({ where: { id: ned.id } })).toBe(0);
    expect(await db.address.count({ where: { userId: ned.id } })).toBe(0);
    expect(await db.wishlistItem.count({ where: { userId: ned.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: ned.id } })).toBe(0);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ userId: null, email: mail('ned') });
    expect(jar.has('cs')).toBe(false);
  });

  it('a staff session cookie never signs a customer in', async () => {
    const staff = await getDb().user.findUniqueOrThrow({ where: { email: mail('staffer') } });
    const row = await getDb().session.create({ data: { sessionToken: `staff-${tag}-${'q'.repeat(30)}`, userId: staff.id, expires: new Date(Date.now() + 1e9) } });
    jar.set('cs', row.sessionToken);
    expect(await getCustomer()).toBeNull();
  });
});
