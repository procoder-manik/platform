import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/data';
import { getSetting as getFresh } from '@/lib/settings/store';
import { affiliateSettings } from '@/lib/growth/settings';
import { siteSettings } from '@/modules/core/settings';
import { PayoutsDesk } from './payouts-desk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payouts' };

export default async function PayoutsPage() {
  await requireAreaPage('marketing');
  if (!(await isOn('affiliates'))) notFound();
  const db = getDb();
  const [ready, commissions, payouts, site, settings, waiting] = await Promise.all([
    db.commission.groupBy({ by: ['affiliateId', 'currency'], where: { status: 'approved', payoutId: null }, _sum: { amount: true }, _count: true }),
    db.commission.findMany({ orderBy: { createdAt: 'desc' }, take: 60, include: { affiliate: { select: { name: true } } } }),
    db.payout.findMany({ orderBy: { createdAt: 'desc' }, take: 40, include: { affiliate: { select: { name: true } } } }),
    getSetting(siteSettings),
    getFresh(affiliateSettings),
    db.affiliate.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true, website: true, createdAt: true } }),
  ]);
  const affiliates = await db.affiliate.findMany({ where: { id: { in: ready.map((r) => r.affiliateId) } }, select: { id: true, name: true, email: true, payoutDetails: true } });
  return (
    <PayoutsDesk
      timeZone={site.timeZone}
      minPayout={settings.minPayout}
      waiting={waiting.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() }))}
      ready={ready.map((r) => { const a = affiliates.find((x) => x.id === r.affiliateId); return { affiliateId: r.affiliateId, name: a?.name ?? 'Unknown', email: a?.email ?? '', details: a?.payoutDetails ?? '', currency: r.currency, amount: r._sum.amount ?? 0, count: r._count }; })}
      commissions={commissions.map((c) => ({ id: c.id, affiliate: c.affiliate.name, orderNumber: c.orderNumber, amount: c.amount, currency: c.currency, status: c.status, approveAt: c.approveAt.toISOString(), note: c.note, at: c.createdAt.toISOString() }))}
      payouts={payouts.map((p) => ({ id: p.id, affiliate: p.affiliate.name, amount: p.amount, currency: p.currency, method: p.method, reference: p.reference, at: p.createdAt.toISOString() }))}
    />
  );
}
