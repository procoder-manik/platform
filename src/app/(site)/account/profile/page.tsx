import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountShell } from '@/components/site/account/Shell';
import { DeleteAccountForm, PasswordForm, ProfileForm } from '@/components/site/client/Account';
import { requireCustomerPage } from '@/lib/accounts/guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your profile', robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const customer = await requireCustomerPage('/account/profile');
  return (
    <AccountShell customer={customer} active="profile" title="Your profile">
      <div className="max-w-lg space-y-12">
        <section aria-labelledby="details"><h2 id="details" className="mb-4 text-h4">Your details</h2><ProfileForm name={customer.name ?? ''} phone={customer.phone ?? ''} email={customer.email} /></section>
        <section aria-labelledby="pw"><h2 id="pw" className="mb-4 text-h4">Password</h2><PasswordForm /></section>
        <section aria-labelledby="data"><h2 id="data" className="mb-2 text-h4">Your data</h2><p>Download everything we hold about your account as a file.</p><p className="mt-3"><Link href="/account/data" prefetch={false} className="btn btn-ghost">Download my data</Link></p></section>
        <section aria-labelledby="del"><h2 id="del" className="mb-4 text-h4">Delete your account</h2><DeleteAccountForm /></section>
      </div>
    </AccountShell>
  );
}
