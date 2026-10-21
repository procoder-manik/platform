/* Public header and footer, drawn from the Header and footer settings and the brand. */
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { NavigationSettings } from '@/modules/core/navigation';
import type { BrandSettings } from '@/lib/theme/brand';
import type { ModuleStates } from '@/lib/modules/logic';
import { modulesForPath } from '@/lib/modules/logic';
import { MODULE_METAS } from '@/lib/modules/server';
import { Icon } from './Icon';
import { MobileMenu, ThemeToggle, type MenuLink } from './client/Chrome';
import { SmartLink } from './blocks/parts';

/** Drops links that point at a switched-off module, so no menu leads to a dead page. */
export function liveLink(href: string, states: ModuleStates): boolean {
  if (!href.startsWith('/')) return true;
  const path = href.split(/[?#]/)[0] || '/';
  return modulesForPath(MODULE_METAS, path).every((id) => states[id] === true);
}

function Logo({ brand, siteName }: { brand: BrandSettings; siteName: string }) {
  if (!brand.logoLight) return <span className="font-display text-xl font-semibold text-ink">{siteName}</span>;
  return (
    <>
      <img src={brand.logoLight} alt={siteName} className={`h-9 w-auto ${brand.logoDark ? 'dark:hidden' : ''}`} />
      {brand.logoDark ? <img src={brand.logoDark} alt={siteName} className="hidden h-9 w-auto dark:block" /> : null}
    </>
  );
}

export function SiteHeader({ nav, brand, siteName, states }: { nav: NavigationSettings; brand: BrandSettings; siteName: string; states: ModuleStates }) {
  const links: MenuLink[] = nav.menu
    .filter((l) => l.label && l.href && liveLink(l.href, states))
    .map((l) => ({ ...l, children: (l.children ?? []).filter((c) => c.label && c.href && liveLink(c.href, states)) }));
  const button = nav.buttonLabel && nav.buttonHref && liveLink(nav.buttonHref, states) ? { label: nav.buttonLabel, href: nav.buttonHref } : null;
  const half = Math.ceil(links.length / 2);

  const menu = (items: MenuLink[]) => (
    <ul className="flex items-center gap-1">
      {items.map((l) => (
        <li key={`${l.label}-${l.href}`} className="group relative">
          <Link href={l.href} className="flex min-h-11 items-center gap-1 rounded-button px-3 font-medium text-ink hover:bg-raised">
            {l.label}
            {l.children?.length ? <Icon name="chevron-down" className="h-4 w-4" /> : null}
          </Link>
          {l.children?.length ? (
            <ul className="invisible absolute left-0 top-full z-40 min-w-56 rounded-card border border-line bg-surface p-2 opacity-0 shadow-card transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              {l.children.map((c) => (
                <li key={`${c.label}-${c.href}`}><Link href={c.href} className="flex min-h-10 items-center rounded-button px-3 text-body hover:bg-raised hover:text-ink">{c.label}</Link></li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );

  const tools = (
    <div className="flex items-center gap-1">
      {nav.showAccountIcon && states.accounts ? <Link href="/account" aria-label="Your account" className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised"><Icon name="user" /></Link> : null}
      {nav.showCartIcon && states.store ? <Link href="/cart" aria-label="Cart" className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised"><Icon name="cart" /></Link> : null}
      {brand.modeToggle ? <ThemeToggle /> : null}
      {button ? <SmartLink href={button.href} className="btn btn-primary ml-2 hidden md:inline-flex">{button.label}</SmartLink> : null}
      <MobileMenu links={links} style={nav.mobileMenu} button={button} />
    </div>
  );

  return (
    <header className={`${nav.sticky ? 'sticky top-0' : 'relative'} z-30 border-b border-line bg-base/90 backdrop-blur`} style={nav.sticky ? { paddingTop: 'env(safe-area-inset-top, 0px)' } : undefined}>
      <div className="relative mx-auto flex min-h-16 max-w-shell items-center justify-between gap-4 px-5 sm:px-6">
        {nav.headerLayout === 'split' ? (
          <>
            <nav aria-label="Main" className="hidden flex-1 md:block">{menu(links.slice(0, half))}</nav>
            <Link href="/" className="flex items-center">{<Logo brand={brand} siteName={siteName} />}</Link>
            <div className="flex flex-1 items-center justify-end gap-2"><nav aria-label="More" className="hidden md:block">{menu(links.slice(half))}</nav>{tools}</div>
          </>
        ) : nav.headerLayout === 'centered' ? (
          <div className="flex w-full flex-col items-center gap-1 py-3 md:py-4">
            <div className="flex w-full items-center justify-between md:justify-center"><Link href="/" className="flex items-center"><Logo brand={brand} siteName={siteName} /></Link><div className="md:hidden">{tools}</div></div>
            <div className="hidden w-full items-center justify-center gap-2 md:flex"><nav aria-label="Main">{menu(links)}</nav>{tools}</div>
          </div>
        ) : (
          <>
            <Link href="/" className="flex items-center">{<Logo brand={brand} siteName={siteName} />}</Link>
            <div className="flex items-center gap-2"><nav aria-label="Main" className="hidden md:block">{menu(links)}</nav>{tools}</div>
          </>
        )}
      </div>
    </header>
  );
}

const SOCIAL_LABEL: Record<string, string> = { x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', github: 'GitHub', whatsapp: 'WhatsApp' };

export function SiteFooter({ nav, brand, siteName, states, footerPages, extraColumns = [] }: { nav: NavigationSettings; brand: BrandSettings; siteName: string; states: ModuleStates; footerPages: { title: string; slug: string }[]; extraColumns?: { title: string; links: { label: string; href: string }[] }[] }) {
  const columns = [
    ...nav.footerColumns.map((c) => ({ title: c.title, links: (c.links ?? []).filter((l) => l.label && l.href && liveLink(l.href, states)) })),
    ...(nav.footerPages && footerPages.length ? [{ title: 'Pages', links: footerPages.map((p) => ({ label: p.title, href: `/${p.slug}` })) }] : []),
    ...extraColumns,
  ].filter((c) => c.links.length);
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid max-w-shell gap-10 px-5 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="inline-flex items-center"><Logo brand={brand} siteName={siteName} /></Link>
          {nav.footerAbout ? <p className="mt-4 max-w-sm text-sm">{nav.footerAbout}</p> : null}
          {nav.social.length ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {nav.social.map((s) => (
                <li key={s.url}>
                  <a href={s.platform === 'email' && !s.url.startsWith('mailto:') ? `mailto:${s.url}` : s.url} target="_blank" rel="noopener noreferrer me" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink hover:bg-raised">
                    {SOCIAL_LABEL[s.platform] ?? s.platform.charAt(0).toUpperCase() + s.platform.slice(1)}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="font-semibold text-ink">{c.title}</p>
            <ul className="mt-3 space-y-1">
              {c.links.map((l) => <li key={`${l.label}-${l.href}`}><SmartLink href={l.href} className="inline-flex min-h-9 items-center text-sm hover:text-ink hover:underline">{l.label}</SmartLink></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-2 px-5 py-5 text-sm text-muted sm:px-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <p>{nav.footerBottom || `© ${new Date().getFullYear()} ${siteName}`}</p>
          {brand.poweredBy ? <p>Powered by the white-label platform</p> : null}
        </div>
      </div>
    </footer>
  );
}
