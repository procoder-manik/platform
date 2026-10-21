import type { ReactNode } from 'react';
import { getModuleStates, getSetting } from '@/lib/data';
import { getFooterPages } from '@/lib/data/pages';
import { listApps } from '@/lib/data/content';
import { appsSettings } from '@/modules/productsShowcase/settings';
import { brandSettings } from '@/lib/theme/brand';
import { navigationSettings } from '@/modules/core/navigation';
import { siteSettings } from '@/modules/core/settings';
import { SiteFooter, SiteHeader } from './Chrome';
import { BackToTop } from './client/Chrome';
import { RevealObserver } from './client/Interactive';

/** Header, footer, skip link and floating buttons around public pages (and the 404 page). */
export async function SiteFrame({ children }: { children: ReactNode }) {
  const [site, brand, nav, states, footerPages] = await Promise.all([getSetting(siteSettings), getSetting(brandSettings), getSetting(navigationSettings), getModuleStates(), getFooterPages()]);
  const [apps, appsText] = states.productsShowcase ? await Promise.all([listApps({ footer: true }), getSetting(appsSettings)]) : [[], null];
  const extraColumns = apps.length && appsText ? [{ title: appsText.title, links: apps.map((a) => ({ label: a.name, href: `/apps/${a.slug}` })) }] : [];
  return (
    <div className="site flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <SiteHeader nav={nav} brand={brand} siteName={site.siteName} states={states} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter nav={nav} brand={brand} siteName={site.siteName} states={states} footerPages={footerPages} extraColumns={extraColumns} />
      {nav.backToTop ? <BackToTop side={nav.backToTopSide} stacked={states.chat === true && nav.chatSide === nav.backToTopSide} /> : null}
      <RevealObserver />
    </div>
  );
}
