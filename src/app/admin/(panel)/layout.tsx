import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireStaffPage } from '@/lib/auth/guards';
import { buildAdminNav } from '@/lib/admin/nav';
import { getModuleStates, getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';
import { brandSettings } from '@/lib/theme/brand';
import { signOutAction } from '../actions';

export const metadata = { robots: { index: false } };

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaffPage();
  const [site, states, brand] = await Promise.all([getSetting(siteSettings), getModuleStates(), getSetting(brandSettings)]);
  const groups = buildAdminNav(states, staff.areas);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="border-b border-line bg-surface md:min-h-dvh md:border-b-0 md:border-r">
        <div className="px-5 py-5">
          <Link href="/admin" className="font-display text-base font-semibold text-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {brand.adminLogo ? <img src={brand.adminLogo} alt={site.siteName} className="h-8 w-auto" /> : site.siteName}
          </Link>
          <p className="mt-0.5 text-xs text-muted">Admin{brand.poweredBy ? ', powered by the white-label platform' : ''}</p>
        </div>
        <nav aria-label="Admin" className="px-3 pb-6">
          {groups.map((group) => (
            <div key={group.name} className="mt-4 first:mt-0">
              <p className="px-2 text-xs font-medium text-muted">{group.name}</p>
              <ul className="mt-1 space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-10 items-center rounded-button px-2 text-sm text-body hover:bg-raised hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-end gap-4 border-b border-line px-6 py-3 text-sm">
          <span className="text-muted">{staff.name ?? staff.email}</span>
          <form action={signOutAction}>
            <button type="submit" className="min-h-10 rounded-button px-3 text-body hover:bg-raised">
              Sign out
            </button>
          </form>
        </header>
        <main id="main" className="px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
