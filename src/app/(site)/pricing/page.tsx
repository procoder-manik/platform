import type { Metadata } from 'next';
import { getModuleStates, getSetting } from '@/lib/data';
import { listServices } from '@/lib/data/services';
import { servicesSettings } from '@/modules/services/settings';
import { PackageBrowser } from '@/components/site/client/PackageBrowser';
import { PageIntro } from '@/components/site/content/Cards';
import { SeoHead, collectionContext } from '@/components/site/SeoHead';
import { seoMetadata } from '@/lib/seo/meta';
import { toDecimal } from '@/lib/checkout/money';
import { quoteFor } from '@/lib/checkout/pricing';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSetting(servicesSettings);
  return seoMetadata({ title: s.title, description: s.intro, path: '/pricing' });
}

export default async function PricingPage() {
  const [s, services, states] = await Promise.all([getSetting(servicesSettings), listServices(), getModuleStates()]);
  const ctx = collectionContext('/pricing', s.title, s.intro || null, [{ name: s.title, path: '/pricing' }]);
  // Service and Offer structured data for packages that have a public price.
  const offers = services.flatMap((svc) => svc.packages.filter((p) => p.mode === 'buy' && p.price > 0).map((p) => ({ service: svc.name, name: p.name, description: p.tagline ?? '', price: toDecimal(quoteFor(p, p.monthlyYearly ? 'monthly' : undefined).unit), currency: p.currency, url: `/checkout/${p.slug}` })));
  return (
    <>
      <SeoHead page={{ ...ctx, offers }} />
      <PageIntro title={s.title} intro={s.intro} />
      <div className="mx-auto max-w-shell px-5 pb-24 sm:px-6">
        {services.length === 0 ? <p className="rounded-card border border-line bg-surface p-8 text-center">No packages are listed yet.</p> : (
          <PackageBrowser services={services} defaultPeriod={s.defaultPeriod} showEffectiveMonthly={s.showEffectiveMonthly} checkoutOn={states.checkout === true} contactHref={s.contactHref} headingLevel="h2" />
        )}
      </div>
    </>
  );
}
