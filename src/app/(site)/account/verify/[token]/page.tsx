import type { Metadata } from 'next';
import { ConfirmLink } from '@/components/site/client/Account';

export const metadata: Metadata = { title: 'Confirm your email address', robots: { index: false, follow: false, nocache: true } };

/** The emailed link only opens this page. Pressing the button does the work, so mail scanners cannot use the link up. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:px-6 md:py-24">
      <h1>Confirm your email address</h1>
      <p className="mt-2 mb-6">Press the button to continue.</p>
      <ConfirmLink kind="verify" token={(await params).token} />
    </div>
  );
}
