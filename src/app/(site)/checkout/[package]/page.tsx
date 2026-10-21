import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { availableMethods } from '@/lib/adapters/payments';
import { getBuyablePackage } from '@/lib/data/services';
import { getSetting } from '@/lib/data';
import { allowedPeriods, quoteFor, type PackagePricing } from '@/lib/checkout/pricing';
import { paymentSettings } from '@/lib/checkout/settings';
import { servicesSettings } from '@/modules/services/settings';
import { isOn } from '@/lib/modules/server';
import { getCustomer } from '@/lib/accounts/engine';
import { CheckoutForm } from '@/components/site/client/CheckoutForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

type Props = { params: Promise<{ package: string }>; searchParams: Promise<{ period?: string }> };

export default async function CheckoutPage({ params, searchParams }: Props) {
  const slug = (await params).package;
  const pkg = await getBuyablePackage(slug);
  if (!pkg) notFound();
  const [settings, services, methods] = await Promise.all([getSetting(paymentSettings), getSetting(servicesSettings), availableMethods()]);
  if (pkg.mode !== 'buy') redirect(`${services.contactHref}?package=${encodeURIComponent(pkg.name)}&service=${encodeURIComponent(pkg.service.name)}`);

  const pricing = pkg as PackagePricing;
  const wanted = (await searchParams).period;
  let initial = allowedPeriods(pricing)[0] ?? 'once';
  try {
    initial = quoteFor(pricing, wanted).period;
  } catch {
    /* an unknown period falls back to the package's first one */
  }

  const customer = (await isOn('accounts')) ? await getCustomer() : null;
  const recurring = (pkg.billing === 'MONTHLY' || pkg.billing === 'YEARLY') && (await isOn('subscriptions'));

  if (methods.length === 0) {
    return (
      <section className="mx-auto max-w-2xl px-5 py-24 sm:px-6">
        <h1>Checkout is not ready yet</h1>
        <p className="mt-4 text-lg">Online payment is not set up on this site yet. Please <Link className="text-primary underline" href={`${services.contactHref}?package=${encodeURIComponent(pkg.name)}&service=${encodeURIComponent(pkg.service.name)}`}>contact us</Link> to order {pkg.name}.</p>
      </section>
    );
  }

  return (
    <CheckoutForm
      pkg={{ slug: pkg.slug, name: pkg.name, tagline: pkg.tagline, serviceName: pkg.service.name, currency: pkg.currency, price: pkg.price, priceMax: pkg.priceMax, billing: pkg.billing, monthlyYearly: pkg.monthlyYearly, yearlyDiscountPct: pkg.yearlyDiscountPct, yearlyPrice: pkg.yearlyPrice, deliveryDays: pkg.deliveryDays, features: pkg.features }}
      requirements={(Array.isArray(pkg.service.requirements) ? pkg.service.requirements : []) as { label: string; kind: string; required?: boolean; options?: string[] }[]}
      methods={methods.map((m) => ({ id: m.def.id, label: m.label, hint: m.def.hint, kind: m.def.kind }))}
      tax={{ ratePct: settings.taxRatePct, inclusive: settings.taxInclusive, label: settings.taxLabel }}
      terms={{ required: settings.requireTerms, href: settings.termsUrl }}
      initialPeriod={initial}
      initialCode={(await cookies()).get('ref')?.value ?? ''}
      prefill={customer ? { name: customer.name ?? '', email: customer.email, phone: customer.phone ?? '' } : undefined}
      recurringNote={recurring ? 'This is a recurring plan. You pay for the first term now. Before it ends we email you a renewal invoice. Nothing is charged automatically, and you can stop renewing at any time.' : null}
    />
  );
}
