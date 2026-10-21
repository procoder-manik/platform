import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/auth/guards';
import { getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage() {
  if (await getStaff()) redirect('/admin');
  const site = await getSetting(siteSettings);
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8">
        <p className="text-sm text-muted">{site.siteName}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Sign in to the admin</h1>
        <LoginForm />
      </div>
    </main>
  );
}
