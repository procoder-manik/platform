import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { availableMethods } from '@/lib/adapters/payments';
import { getCustomer, listAddresses } from '@/lib/accounts/engine';
import { isOn } from '@/lib/modules/server';
import { StoreCheckoutForm } from '@/components/site/client/StoreCheckoutForm';
import { paymentSettings } from '@/lib/checkout/settings';
import { getSetting } from '@/lib/settings/store';
import { priceBasket } from '@/lib/store/engine';
import { countryName, ISO_COUNTRIES, parseCart } from '@/lib/store/logic';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default async function StoreCheckoutPage() {
  const lines = parseCart((await cookies()).get('cart')?.value);
  const [basket, methods, pay] = await Promise.all([priceBasket({ lines }), availableMethods(), getSetting(paymentSettings)]);
  if (basket.lines.length === 0) {
    return (
      <section className="mx-auto max-w-2xl px-5 py-24 sm:px-6">
        <h1>Your cart is empty</h1>
        <p className="mt-4 text-lg"><Link className="text-primary underline" href="/shop">Continue shopping</Link></p>
      </section>
    );
  }
  if (methods.length === 0) {
    return (
      <section className="mx-auto max-w-2xl px-5 py-24 sm:px-6">
        <h1>Checkout is not ready yet</h1>
        <p className="mt-4 text-lg">Online payment is not set up on this site yet. Please <Link className="text-primary underline" href="/contact">contact us</Link> to order.</p>
      </section>
    );
  }
  const customer = (await isOn('accounts')) ? await getCustomer() : null;
  const saved = customer ? await listAddresses(customer.id) : [];
  const countries = ISO_COUNTRIES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
  return <StoreCheckoutForm initial={basket} countries={countries} methods={methods.map((m) => ({ id: m.def.id, label: m.label, hint: m.def.hint, kind: m.def.kind }))} terms={{ required: pay.requireTerms, href: pay.termsUrl }} taxLabel={pay.taxLabel} initialCode={(await cookies()).get('ref')?.value ?? ''} prefill={customer ? { name: customer.name ?? '', email: customer.email, phone: customer.phone ?? '' } : undefined} saved={saved.map((a) => ({ id: a.id, label: a.label, name: a.name, line1: a.line1, line2: a.line2, city: a.city, region: a.region, postal: a.postal, country: a.country, phone: a.phone, isDefault: a.isDefault }))} />;
}
