import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/site/client/Account';
import { getCustomer } from '@/lib/accounts/engine';
import { safeNext } from '@/lib/accounts/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCustomer()) redirect(await safeNext(next));
  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:px-6 md:py-24">
      <h1>Sign in</h1>
      <p className="mt-2 mb-6">See your orders, downloads and subscriptions in one place.</p>
      <LoginForm next={next ? await safeNext(next) : undefined} />
    </div>
  );
}
