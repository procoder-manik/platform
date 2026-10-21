import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSetting } from '@/lib/data';
import { brandSettings } from '@/lib/theme/brand';
import { buildTheme } from '@/lib/theme/css';
import { fontVariables } from '@/lib/theme/fonts';
import { siteSettings } from '@/modules/core/settings';
import { seoSettings } from '@/lib/seo/settings';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const [site, brand, seo] = await Promise.all([getSetting(siteSettings), getSetting(brandSettings), getSetting(seoSettings)]);
  const template = (seo.titleTemplate || '%s | %site%').replace(/%site%/g, site.siteName);
  return {
    metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
    title: { default: site.siteName, template: template.includes('%s') ? template : `%s | ${site.siteName}` },
    verification: { google: seo.googleVerification || undefined, other: seo.bingVerification ? { 'msvalidate.01': seo.bingVerification } : undefined },
    robots: seo.staging ? { index: false, follow: false } : undefined,
    description: site.tagline,
    icons: brand.favicon ? { icon: brand.favicon, apple: brand.favicon } : undefined,
    openGraph: { siteName: site.siteName, images: [seo.shareImage || brand.shareImage || `/og?title=${encodeURIComponent(site.siteName)}`] },
  };
}

/**
 * Applies the colour mode before first paint, so there is no flash: the visitor's saved choice when
 * switching is allowed, otherwise the Brand default. Browser extensions sometimes edit this script,
 * hence suppressHydrationWarning.
 */
function themeScript(mode: 'system' | 'light' | 'dark', toggle: boolean) {
  return `(function(){try{var d=document.documentElement,m=${toggle ? "localStorage.getItem('theme')" : 'null'};if(m!=='light'&&m!=='dark'){m=${JSON.stringify(mode)};if(m==='system')m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=m}catch(e){}})();`;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await getSetting(brandSettings);
  const theme = buildTheme(brand);
  return (
    <html lang="en" className={fontVariables} data-buttons={theme.buttons} data-motion={theme.motion} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript(theme.mode, theme.toggle) }} suppressHydrationWarning />
        <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: theme.css }} />
      </head>
      <body className="min-h-dvh bg-base font-body text-body antialiased">{children}</body>
    </html>
  );
}
