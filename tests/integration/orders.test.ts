/**
 * The order engine against a real database: placing orders from the database price, applying gateway
 * outcomes once, amount mismatches, manual payments, refunds, invoices and the paid handlers.
 * Runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { saveSetting } from '@/lib/settings/store';
import { paymentSettings } from '@/lib/checkout/settings';
import { onOrderPaid } from '@/lib/checkout/events';
import { applyOutcome, changeStatus, markOrderPaid, placeServiceOrder, recordRefund, startPayment, submitManualPayment, verifyPayment, getOrderById, type FullOrder, type PlaceInput } from '@/lib/checkout/orders';
import { HttpError } from '@/lib/http/errors';
import type { WebhookOutcome } from '@/lib/adapters/payments/types';

const run = Boolean(process.env.DATABASE_URL);
const tag = `t${Date.now().toString(36)}`;
let staff = { id: '', name: 'Tester' };
let paidCount = 0;
let previous: unknown = null;

const slug = (s: string) => `${tag}-${s}`;
const input = (patch: Partial<PlaceInput> = {}): PlaceInput => ({ packageSlug: slug('once'), name: 'Sam', email: `${tag}@orders.test`, phone: '0170', requirements: { Site: 'example.com' }, methodId: 'bkash', ...patch });
const outcome = (o: FullOrder, patch: Partial<WebhookOutcome> = {}): WebhookOutcome => ({ provider: 'stripe', idempotencyKey: `${tag}:${Math.random()}`, orderId: o.id, status: 'paid', amount: { amount: o.total, currency: o.currency }, reference: `ref_${Math.random()}`, raw: {}, ...patch });
const fresh = async (o: FullOrder) => (await getOrderById(o.id)) as FullOrder;
const refuses = async (p: Promise<unknown>, text: RegExp) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, 'should have been refused').toBeInstanceOf(HttpError);
  expect((e as HttpError).message).toMatch(text);
};

describe.skipIf(!run)('order engine (database)', () => {
  beforeAll(async () => {
    const db = getDb();
    staff = { id: (await db.user.create({ data: { email: `${tag}.staff@orders.test`, kind: 'STAFF', role: 'administrator', name: 'Tester' } })).id, name: 'Tester' };
    previous = (await db.setting.findUnique({ where: { key: 'payments' } }))?.data ?? null;
    await saveSetting(paymentSettings, {
      currency: 'USD', localCurrency: 'BDT', localRate: 122, orderPrefix: 'TS', invoicePrefix: 'TST', taxRatePct: 10, taxInclusive: false, ownerEmail: 'owner@orders.test',
      methods: [
        { id: 'bkash', enabled: true, label: 'bKash', details: 'Number 01700000000', testMode: true },
        { id: 'bank', enabled: true, label: 'Bank', details: 'IBAN 123', testMode: true },
        { id: 'nagad', enabled: false, label: 'Nagad', details: 'Number 01800000000', testMode: true },
        { id: 'stripe', enabled: true, label: 'Card', details: '', testMode: true },
      ],
    });
    const service = await db.service.create({ data: { name: 'Test service', slug: slug('svc'), active: true, requirements: [{ label: 'Site', kind: 'text', required: true }, { label: 'Size', kind: 'select', options: ['S', 'M'] }] } });
    const base = { serviceId: service.id, currency: 'USD', features: [] as string[] };
    await db.package.createMany({
      data: [
        { ...base, name: 'Once', slug: slug('once'), price: 10_000 },
        { ...base, name: 'Monthly', slug: slug('monthly'), price: 1000, billing: 'MONTHLY', monthlyYearly: true, yearlyDiscountPct: 20 },
        { ...base, name: 'Hourly', slug: slug('hourly'), price: 5000, billing: 'HOURLY' },
        { ...base, name: 'Quote', slug: slug('quote'), price: 20_000, mode: 'quote' },
        { ...base, name: 'Off', slug: slug('off'), price: 10_000, active: false },
        { ...base, name: 'Free', slug: slug('free'), price: 0 },
      ],
    });
    onOrderPaid(`test-${tag}`, async () => {
      paidCount += 1;
    });
    onOrderPaid(`test-broken-${tag}`, async () => {
      throw new Error('a broken handler must not undo the payment');
    });
  });

  afterAll(async () => {
    const db = getDb();
    await db.order.deleteMany({ where: { email: { endsWith: '@orders.test' } } });
    await db.auditLog.deleteMany({ where: { userId: staff.id } });
    await db.user.deleteMany({ where: { email: { endsWith: '@orders.test' } } });
    await db.package.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.service.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.emailLog.deleteMany({ where: { to: { endsWith: '@orders.test' } } });
    if (previous === null) await db.setting.deleteMany({ where: { key: 'payments' } });
    else await db.setting.update({ where: { key: 'payments' }, data: { data: previous as object } });
  });

  it('prices the order from the database, with tax, a snapshot and a private token', async () => {
    const o = await placeServiceOrder(input());
    expect(o).toMatchObject({ subtotal: 10_000, tax: 1000, total: 11_000, currency: 'USD', status: 'PENDING_PAYMENT', methodId: 'bkash' });
    expect(o.number).toMatch(/^TS-\d{6}-[A-Z0-9]{4}$/);
    expect(o.token.length).toBeGreaterThanOrEqual(40);
    expect(o.items[0]).toMatchObject({ unitPrice: 10_000, quantity: 1, kind: 'package' });
    expect((o.items[0]?.snapshot as { package: { name: string } }).package.name).toBe('Once');
    expect(o.requirements).toEqual([{ label: 'Site', value: 'example.com' }]);
  });

  it('refuses everything the browser could tamper with', async () => {
    await refuses(placeServiceOrder(input({ packageSlug: slug('off') })), /not available/);
    await refuses(placeServiceOrder(input({ packageSlug: 'does-not-exist' })), /not available/);
    await refuses(placeServiceOrder(input({ packageSlug: slug('quote') })), /quoted/);
    await refuses(placeServiceOrder(input({ packageSlug: slug('free') })), /no price/);
    await refuses(placeServiceOrder(input({ period: 'yearly' })), /cannot be bought/);
    await refuses(placeServiceOrder(input({ packageSlug: slug('monthly'), period: 'weekly' })), /cannot be bought/);
    await refuses(placeServiceOrder(input({ methodId: 'nagad' })), /not available/);
    await refuses(placeServiceOrder(input({ methodId: 'stripe' })), /not available/);
    await refuses(placeServiceOrder(input({ methodId: 'bitcoin' })), /not available/);
    await refuses(placeServiceOrder(input({ requirements: {} })), /Site/);
    await refuses(placeServiceOrder(input({ requirements: { Site: 'x', Size: 'XXL' } })), /Size/);
  });

  it('works out monthly, yearly and hourly prices on the server', async () => {
    const monthly = await placeServiceOrder(input({ packageSlug: slug('monthly'), period: 'monthly' }));
    expect(monthly.subtotal).toBe(1000);
    const yearly = await placeServiceOrder(input({ packageSlug: slug('monthly'), period: 'yearly' }));
    expect(yearly.subtotal).toBe(9600);
    expect(yearly.items[0]?.title).toContain('per year');
    const hours = await placeServiceOrder(input({ packageSlug: slug('hourly'), quantity: 4 }));
    expect(hours.subtotal).toBe(20_000);
    expect((await placeServiceOrder(input({ packageSlug: slug('hourly'), quantity: 99_999 }))).items[0]?.quantity).toBe(1000);
    // A quantity on a one-time package is ignored.
    expect((await placeServiceOrder(input({ quantity: 50 }))).subtotal).toBe(10_000);
  });

  it('marks an order paid once however many events arrive, and runs the module handlers once', async () => {
    const o = await placeServiceOrder(input());
    const before = paidCount;
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => applyOutcome(outcome(o, { idempotencyKey: `${tag}:race:${o.id}:${i}` }))));
    expect(results.filter((r) => r === 'applied')).toHaveLength(1);
    expect(results.filter((r) => r === 'already_paid')).toHaveLength(5);
    expect(paidCount - before).toBe(1);
    const paid = await fresh(o);
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt).toBeTruthy();
    expect(paid.invoiceNumber).toMatch(/^TST-\d{4}-\d{4}$/);
    // The same event again is a duplicate and changes nothing.
    const e = outcome(o, { idempotencyKey: `${tag}:same` });
    await applyOutcome(e);
    expect(await applyOutcome(e)).toBe('duplicate');
  });

  it('sends the receipt and the owner alert, and logs them against the order', async () => {
    const o = await placeServiceOrder(input({ email: `${tag}.mail@orders.test` }));
    await applyOutcome(outcome(o));
    const logs = await getDb().emailLog.findMany({ where: { entity: 'order', entityId: o.id } });
    expect(logs.map((l) => l.template).sort()).toEqual(['order.paid', 'owner.paid']);
    expect(logs.every((l) => l.ok)).toBe(true);
    expect(logs.find((l) => l.template === 'order.paid')?.to).toBe(`${tag}.mail@orders.test`);
  });

  it('numbers invoices in order without gaps or repeats', async () => {
    const orders = await Promise.all(Array.from({ length: 4 }, () => placeServiceOrder(input({ email: `${tag}.inv@orders.test` }))));
    await Promise.all(orders.map((o) => markOrderPaid(o.id, 'test')));
    const numbers = (await Promise.all(orders.map(fresh))).map((o) => Number(o.invoiceNumber?.split('-')[2])).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(4);
    expect(numbers[3]! - numbers[0]!).toBe(3);
  });

  it('never marks an order paid when the gateway amount or currency differs', async () => {
    const o = await placeServiceOrder(input());
    expect(await applyOutcome(outcome(o, { amount: { amount: 100, currency: 'USD' } }))).toBe('mismatch');
    let now = await fresh(o);
    expect(now.status).toBe('VERIFYING');
    expect(now.invoiceNumber).toBeNull();
    expect(now.payments.some((p) => p.status === 'mismatch')).toBe(true);
    expect(JSON.stringify(now.history)).toContain('Check it before marking the order paid');

    const o2 = await placeServiceOrder(input());
    expect(await applyOutcome(outcome(o2, { amount: { amount: o2.total, currency: 'EUR' } }))).toBe('mismatch');
    const o3 = await placeServiceOrder(input());
    expect(await applyOutcome(outcome(o3, { amount: undefined }))).toBe('mismatch');
    now = await fresh(o3);
    expect(now.status).toBe('VERIFYING');
    const alerts = await getDb().emailLog.count({ where: { entity: 'order', entityId: o.id, template: 'owner.attention' } });
    expect(alerts).toBe(1);
  });

  it('records failures, ignores unknown orders and finds orders by gateway reference', async () => {
    const o = await placeServiceOrder(input());
    expect(await applyOutcome(outcome(o, { status: 'failed' }))).toBe('applied');
    expect((await fresh(o)).status).toBe('FAILED');
    expect(await applyOutcome(outcome(o, { orderId: 'no-such-order' }))).toBe('unknown_order');
    expect(await applyOutcome(outcome(o, { status: 'ignored' }))).toBe('ignored');

    const byRef = await placeServiceOrder(input());
    await getDb().payment.create({ data: { orderId: byRef.id, provider: 'stripe', status: 'pending', amount: byRef.total, currency: 'USD', reference: `pi_${tag}` } });
    expect(await applyOutcome(outcome(byRef, { orderId: '', reference: `pi_${tag}` }))).toBe('applied');
    expect((await fresh(byRef)).status).toBe('PAID');
  });

  it('a failed order can still be paid afterwards', async () => {
    const o = await placeServiceOrder(input());
    await applyOutcome(outcome(o, { status: 'failed' }));
    expect(await applyOutcome(outcome(o))).toBe('applied');
    expect((await fresh(o)).status).toBe('PAID');
  });

  it('applies running refund totals from the gateway as the difference', async () => {
    const o = await placeServiceOrder(input());
    await applyOutcome(outcome(o, { reference: `pi_${tag}_r` }));
    const refund = (cumulative: number, key: string) => outcome(o, { status: 'refunded', cumulative: true, amount: { amount: cumulative, currency: 'USD' }, idempotencyKey: key });
    expect(await applyOutcome(refund(3000, `${tag}:rf1`))).toBe('applied');
    expect((await fresh(o)).status).toBe('PAID');
    expect(await applyOutcome(refund(3000, `${tag}:rf2`))).toBe('ignored');
    expect(await applyOutcome(refund(o.total, `${tag}:rf3`))).toBe('applied');
    const done = await fresh(o);
    expect(done.status).toBe('REFUNDED');
    expect(done.payments.filter((p) => p.status === 'refunded').map((p) => p.amount)).toEqual([3000, o.total - 3000]);
  });

  it('takes a manual payment from submission to verified', async () => {
    const o = await placeServiceOrder(input({ email: `${tag}.manual@orders.test` }));
    await startPayment(o, 'bkash');
    const started = await fresh(o);
    await refuses(submitManualPayment(started, { transactionId: 'x' }), /transaction ID/);
    await submitManualPayment(started, { transactionId: `TX${tag}A1`, senderNumber: '01711111111' });
    const checking = await fresh(o);
    expect(checking.status).toBe('VERIFYING');
    const pay = checking.payments.find((p) => p.status === 'submitted')!;
    expect(pay.reference).toBe(`TX${tag}A1`);
    expect((await getDb().emailLog.count({ where: { entity: 'order', entityId: o.id, template: 'owner.proof' } }))).toBe(1);
    await verifyPayment(o.id, pay.id, true, 'Tester');
    const paid = await fresh(o);
    expect(paid.status).toBe('PAID');
    expect(paid.invoiceNumber).toBeTruthy();
    await refuses(verifyPayment(o.id, pay.id, true, 'Tester'), /not waiting/);
  });

  it('flags a transaction ID that was already used on another order, and lets a rejected payment be sent again', async () => {
    const a = await placeServiceOrder(input({ email: `${tag}.dupa@orders.test` }));
    await startPayment(a, 'bkash');
    await submitManualPayment(await fresh(a), { transactionId: `DUP${tag}` });
    const b = await placeServiceOrder(input({ email: `${tag}.dupb@orders.test` }));
    await startPayment(b, 'bkash');
    await submitManualPayment(await fresh(b), { transactionId: `DUP${tag}` });
    const pay = (await fresh(b)).payments.find((p) => p.status === 'submitted')!;
    expect((pay.proof as { duplicateOf?: string }).duplicateOf).toBe(a.number);

    await verifyPayment(b.id, pay.id, false, 'Tester', 'Not found in our account');
    const rejected = await fresh(b);
    expect(rejected.status).toBe('FAILED');
    expect(rejected.payments.find((p) => p.id === pay.id)?.status).toBe('rejected');
    await submitManualPayment(rejected, { transactionId: `NEW${tag}` });
    expect((await fresh(b)).status).toBe('VERIFYING');
  });

  it('a bank payment needs a receipt or a reference', async () => {
    const o = await placeServiceOrder(input({ methodId: 'bank', email: `${tag}.bank@orders.test` }));
    await startPayment(o, 'bank');
    await refuses(submitManualPayment(await fresh(o), {}), /receipt/);
    await refuses(submitManualPayment(await fresh(o), { proof: { key: 'proofs/someone-else/x.png', mime: 'image/png', size: 100 } }), /does not belong/);
    await submitManualPayment(await fresh(o), { transactionId: `WIRE${tag}` });
    expect((await fresh(o)).status).toBe('VERIFYING');
  });

  it('moves orders only along allowed paths and records who did it', async () => {
    const o = await placeServiceOrder(input({ email: `${tag}.flow@orders.test` }));
    await refuses(changeStatus(o.id, 'COMPLETED', staff), /cannot go from/);
    await changeStatus(o.id, 'PAID', staff, { note: 'Cash in hand' });
    let now = await fresh(o);
    expect(now.status).toBe('PAID');
    expect(now.payments.some((p) => p.status === 'verified' && p.reference?.includes('Tester'))).toBe(true);
    await changeStatus(o.id, 'IN_PROGRESS', staff);
    await refuses(changeStatus(o.id, 'IN_PROGRESS', staff), /already/);
    await changeStatus(o.id, 'COMPLETED', staff);
    now = await fresh(o);
    expect((now.history as { to: string; by: string }[]).map((h) => h.to)).toEqual(['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'COMPLETED']);
    const mails = (await getDb().emailLog.findMany({ where: { entity: 'order', entityId: o.id } })).map((l) => l.template);
    expect(mails).toEqual(expect.arrayContaining(['order.started', 'order.completed', 'order.paid']));
  });

  it('records full and partial refunds and refuses to refund more than was paid', async () => {
    const o = await placeServiceOrder(input({ email: `${tag}.refund@orders.test` }));
    await refuses(recordRefund(o.id, 100, staff), /Only a paid order/);
    await markOrderPaid(o.id, 'test');
    await refuses(recordRefund(o.id, o.total + 1, staff), /at most/);
    await refuses(recordRefund(o.id, 0, staff), /Enter an amount/);
    await recordRefund(o.id, 4000, staff, 'Partly cancelled');
    expect((await fresh(o)).status).toBe('PAID');
    await refuses(recordRefund(o.id, o.total, staff), /at most/);
    await changeStatus(o.id, 'REFUNDED', staff);
    const done = await fresh(o);
    expect(done.status).toBe('REFUNDED');
    expect(done.payments.filter((p) => p.status === 'refunded').reduce((n, p) => n + p.amount, 0)).toBe(o.total);
  });

  it('restarting payment after a failure puts the order back to waiting', async () => {
    const o = await placeServiceOrder(input({ email: `${tag}.retry@orders.test` }));
    await applyOutcome(outcome(o, { status: 'failed' }));
    await startPayment(await fresh(o), 'bkash');
    expect((await fresh(o)).status).toBe('PENDING_PAYMENT');
    await changeStatus(o.id, 'CANCELLED', staff);
    await refuses(startPayment(await fresh(o), 'bkash'), /cannot be paid/);
  });
});
