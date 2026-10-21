import type { Metadata } from 'next';
import { AffiliateApply } from '@/components/site/client/AffiliateApply';
import { PageIntro } from '@/components/site/content/Cards';
import { getSetting } from '@/lib/settings/store';
import { affiliateSettings } from '@/lib/growth/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSetting(affiliateSettings);
  return { title: s.title, description: s.intro || undefined };
}

export default async function AffiliatesPage() {
  const s = await getSetting(affiliateSettings);
  return (
    <>
      <PageIntro title={s.title} intro={s.intro} />
      <div className="mx-auto max-w-xl px-5 pb-24 sm:px-6">
        <p className="mb-6 text-lg">You earn <strong>{s.defaultPct}%</strong> of what customers you send pay, and your link works for {s.cookieDays} days after someone clicks it.</p>
        {s.signupsOpen ? <AffiliateApply /> : <p className="rounded-card border border-line p-5">We are not taking applications right now. Please check back later.</p>}
        {s.terms ? <p className="mt-8 whitespace-pre-line text-sm text-muted">{s.terms}</p> : null}
      </div>
    </>
  );
}
