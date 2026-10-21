import 'server-only';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http/errors';
import type { ResourceHooks } from '@/lib/admin/hooks';
import { mailAffiliate } from '@/lib/growth/engine';
import { normalizeCode } from '@/lib/growth/logic';

/** Codes share one box at checkout, so a code may belong to only one thing. */
async function assertCodeFree(code: string, except: { table: 'coupon' | 'affiliate' | 'referralCode'; id?: string }) {
  const db = getDb();
  const [coupon, affiliate, referral] = await Promise.all([db.coupon.findUnique({ where: { code } }), db.affiliate.findUnique({ where: { code } }), db.referralCode.findUnique({ where: { code } })]);
  const clash = [['coupon', coupon], ['affiliate', affiliate], ['referralCode', referral]] as const;
  for (const [table, row] of clash) if (row && !(table === except.table && row.id === except.id)) throw new HttpError(422, `The code ${code} is already used by a ${table === 'coupon' ? 'coupon' : table === 'affiliate' ? 'affiliate' : 'customer referral code'}. Choose another.`, 'code');
}

/** Customers: staff may only change the name, phone and blocked switch. Blocking signs the customer out everywhere. */
const customerHooks: Record<string, ResourceHooks> = {
  customers: {
    async beforeSave(values) {
      for (const key of Object.keys(values)) if (!['name', 'phone', 'blocked'].includes(key)) delete values[key];
      return values;
    },
    async afterSave(record) {
      if (record.blocked === true) await getDb().session.deleteMany({ where: { userId: String(record.id) } });
    },
  },
};

export const growthHooks: Record<string, ResourceHooks> = {
  ...customerHooks,
  coupons: {
    async beforeSave(values, { existing }) {
      const merged = { ...(existing ?? {}), ...values } as Record<string, unknown>;
      if ('code' in values) {
        const code = normalizeCode(values.code);
        if (!code) throw new HttpError(422, 'Use 3 to 32 letters, numbers, dashes or underscores for the code.', 'code');
        values.code = code;
        await assertCodeFree(code, { table: 'coupon', id: existing ? String(existing.id) : undefined });
      }
      if (merged.kind === 'percent') {
        const p = Number(merged.percent);
        if (!(p >= 1 && p <= 100)) throw new HttpError(422, 'Enter a percentage between 1 and 100.', 'percent');
        values.amount = null;
      } else if (merged.kind === 'fixed') {
        if (!(Number(merged.amount) > 0)) throw new HttpError(422, 'Enter the amount the code takes off.', 'amount');
        values.percent = null;
        values.maxDiscount = null;
      } else {
        values.percent = null;
        values.amount = null;
        values.maxDiscount = null;
        if (merged.scope === 'services') throw new HttpError(422, 'Free shipping only works on shop orders. Choose Everything or Shop products only.', 'scope');
      }
      if (merged.startsAt && merged.endsAt && new Date(String(merged.endsAt)) <= new Date(String(merged.startsAt))) throw new HttpError(422, 'The end date must be after the start date.', 'endsAt');
      return values;
    },
    async beforeDelete(record) {
      const used = await getDb().couponRedemption.count({ where: { couponId: String(record.id) } });
      if (used > 0) throw new HttpError(422, `This code is on ${used} order(s). Switch it off instead of deleting it, so the history stays.`);
    },
  },
  affiliates: {
    async beforeSave(values, { existing, isNew }) {
      if ('email' in values) values.email = String(values.email).trim().toLowerCase();
      const name = String((values.name ?? existing?.name ?? '') as string);
      if ('code' in values || isNew) {
        const raw = String(values.code ?? '').trim();
        const code = raw ? normalizeCode(raw) : normalizeCode(name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'PARTNER');
        if (!code) throw new HttpError(422, 'Use 3 to 32 capital letters or numbers for the code.', 'code');
        values.code = code;
        await assertCodeFree(code, { table: 'affiliate', id: existing ? String(existing.id) : undefined });
      }
      if (isNew) values.token = randomBytes(32).toString('base64url');
      return values;
    },
    async afterSave(record, { existing, isNew }) {
      if (record.status === 'active' && (isNew ? false : existing?.status === 'pending')) await mailAffiliate(String(record.id), 'affiliate.approved');
    },
    async beforeDelete(record) {
      const count = await getDb().commission.count({ where: { affiliateId: String(record.id) } });
      if (count > 0) throw new HttpError(422, `This affiliate has ${count} commission record(s). Pause them instead of deleting, so the money history stays.`);
    },
  },
};
