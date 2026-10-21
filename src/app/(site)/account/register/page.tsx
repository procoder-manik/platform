import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/site/client/Account';
import { getCustomer } from '@/lib/accounts/engine';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create an account', robots: { index: false, follow: false } };

export default async function RegisterPage() {
  if (await getCustomer()) redirect('/account');
  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:px-6 md:py-24">
      <h1>Create an account</h1>
      <p className="mt-2 mb-6">Orders you placed before with the same email address are added once you confirm it.</p>
      <RegisterForm />
    </div>
  );
}
