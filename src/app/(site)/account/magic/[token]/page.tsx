import type { Metadata } from 'next';
import { ConfirmLink } from '@/components/site/client/Account';

export const metadata: Metadata = { title: 'Sign in to your account', robots: { index: false, follow: false, nocache: true } };

/** The emailed link only opens this page. Pressing the button does the work, so mail scanners cannot use the link up. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:px-6 md:py-24">
      <h1>Sign in to your account</h1>
      <p className="mt-2 mb-6">Press the button to continue.</p>
      <ConfirmLink kind="magic" token={(await params).token} />
    </div>
  );
}
