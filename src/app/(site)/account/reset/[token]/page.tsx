import type { Metadata } from 'next';
import { ResetForm } from '@/components/site/client/Account';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false, follow: false, nocache: true } };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:px-6 md:py-24">
      <h1>Choose a new password</h1>
      <p className="mt-2 mb-6">You will be signed out on all your devices.</p>
      <ResetForm token={(await params).token} />
    </div>
  );
}
