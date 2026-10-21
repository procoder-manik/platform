import type { Metadata } from 'next';
import { AccountShell } from '@/components/site/account/Shell';
import { AddressManager } from '@/components/site/client/Account';
import { listAddresses } from '@/lib/accounts/engine';
import { requireCustomerPage } from '@/lib/accounts/guard';
import { countryName, ISO_COUNTRIES } from '@/lib/store/logic';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your addresses', robots: { index: false, follow: false } };

export default async function AddressesPage() {
  const customer = await requireCustomerPage('/account/addresses');
  const addresses = await listAddresses(customer.id);
  const countries = ISO_COUNTRIES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <AccountShell customer={customer} active="addresses" title="Your addresses">
      <AddressManager addresses={addresses.map((a) => ({ id: a.id, label: a.label, name: a.name, line1: a.line1, line2: a.line2, city: a.city, region: a.region, postal: a.postal, country: a.country, phone: a.phone, isDefault: a.isDefault }))} countries={countries} />
    </AccountShell>
  );
}
