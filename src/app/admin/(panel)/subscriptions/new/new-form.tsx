'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createManualAction } from '@/lib/subscriptions/admin-actions';
import { formatMinor } from '@/lib/checkout/money';
import { Button, Notice, PageHeader, inputClass } from '@/components/admin/ui';

export interface PackageChoice {
  id: string;
  label: string;
  currency: string;
  periods: ('monthly' | 'yearly')[];
  prices: Record<string, number>;
}

const PERIOD_OPTIONS = [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }];

/** Adds a subscriber who pays outside the site. The first term is recorded as paid; renewals then work as usual. */
export function NewSubscriptionForm({ packages, defaultCurrency, today }: { packages: PackageChoice[]; defaultCurrency: string; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [packageId, setPackageId] = useState('');
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [startsAt, setStartsAt] = useState(today);
  const [notify, setNotify] = useState(false);

  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const periods = pkg ? pkg.periods : (['monthly', 'yearly'] as const);
  const effectivePeriod = (periods as readonly string[]).includes(period) ? period : (periods[0] ?? 'monthly');
  const hint = pkg ? formatMinor(pkg.prices[effectivePeriod] ?? 0, pkg.currency) : '';
  const fieldError = (f: string) => (error?.field === f ? <span role="alert" className="mt-1 block text-sm text-danger">{error.message}</span> : null);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createManualAction({ packageId: packageId || undefined, title: pkg ? undefined : title || undefined, period: effectivePeriod, amount: amount || undefined, name, email, phone: phone || undefined, startsAt, notify });
      if (!r.ok) return setError({ message: r.message, field: r.field });
      router.push(r.id ? `/admin/subscriptions/${r.id}` : '/admin/subscriptions');
    });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Add subscription" description="For customers who pay you outside the site, or whose plan began before you used this system. The first term is recorded as paid and starts on the date you choose. Renewals then work as usual." actions={<Link href="/admin/subscriptions" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">All subscriptions</Link>} />
      {error && !error.field ? <Notice tone="error">{error.message}</Notice> : null}

      <div className="grid gap-4 rounded-card border border-line bg-surface p-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink sm:col-span-2">Package
          <select className={`${inputClass} mt-1`} value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="">No package (custom plan)</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {fieldError('packageId')}
        </label>
        {!pkg ? <label className="text-sm font-medium text-ink sm:col-span-2">Plan name<input className={`${inputClass} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website care plan" maxLength={160} />{fieldError('title')}</label> : null}
        <label className="text-sm font-medium text-ink">Billed
          <select className={`${inputClass} mt-1`} value={effectivePeriod} onChange={(e) => setPeriod(e.target.value)}>
            {PERIOD_OPTIONS.filter((o) => (periods as readonly string[]).includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {fieldError('period')}
        </label>
        <label className="text-sm font-medium text-ink">Price per term ({pkg?.currency ?? defaultCurrency})
          <input inputMode="decimal" className={`${inputClass} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={hint || '49.00'} />
          <span className="mt-1 block text-xs text-muted">{pkg ? 'Leave empty to use the package price.' : 'Before tax. This is what each renewal invoice charges.'}</span>
          {fieldError('amount')}
        </label>
        <label className="text-sm font-medium text-ink">Customer name<input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />{fieldError('name')}</label>
        <label className="text-sm font-medium text-ink">Customer email<input type="email" className={`${inputClass} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />{fieldError('email')}</label>
        <label className="text-sm font-medium text-ink">Phone (optional)<input className={`${inputClass} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" /></label>
        <label className="text-sm font-medium text-ink">First term starts<input type="date" className={`${inputClass} mt-1`} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />{fieldError('startsAt')}</label>
        <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the customer a link to their plan page</label>
      </div>
      <div><Button variant="primary" disabled={pending} onClick={submit}>{pending ? 'Adding…' : 'Add subscription'}</Button></div>
    </div>
  );
}
