import type { Metadata } from 'next';
import { ForgotForm } from '@/components/site/client/Account';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false, follow: false } };

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:px-6 md:py-24">
      <h1>Reset your password</h1>
      <p className="mt-2 mb-6">Enter your email address and we will send you a link to choose a new password.</p>
      <ForgotForm />
    </div>
  );
}
