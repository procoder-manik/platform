import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/settings/store';
import { paymentSettings } from '@/lib/checkout/settings';
import { allowedPeriods, quoteFor, type PackagePricing } from '@/lib/checkout/pricing';
import { NewSubscriptionForm, type PackageChoice } from './new-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Add subscription' };

export default async function NewSubscriptionPage() {
  await requireAreaPage('shop');
  if (!(await isOn('subscriptions'))) notFound();
  const [packages, pay] = await Promise.all([
    getDb().package.findMany({ where: { billing: { in: ['MONTHLY', 'YEARLY'] }, mode: 'buy' }, include: { service: true }, orderBy: [{ service: { order: 'asc' } }, { order: 'asc' }] }),
    getSetting(paymentSettings),
  ]);
  const choices: PackageChoice[] = packages.map((p) => {
    const pricing = p as PackagePricing;
    const periods = allowedPeriods(pricing).filter((x): x is 'monthly' | 'yearly' => x === 'monthly' || x === 'yearly');
    return { id: p.id, label: `${p.service.name}: ${p.name}${p.active ? '' : ' (hidden)'}`, currency: p.currency, periods, prices: Object.fromEntries(periods.map((x) => [x, quoteFor(pricing, x).unit])) as Record<string, number> };
  });
  return <NewSubscriptionForm packages={choices} defaultCurrency={pay.currency} today={new Date().toISOString().slice(0, 10)} />;
}
