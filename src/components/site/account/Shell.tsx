import Link from 'next/link';
import type { ReactNode } from 'react';
import { ResendVerify, SignOutButton } from '@/components/site/client/Account';
import type { Customer } from '@/lib/accounts/engine';

const LINKS = [
  { href: '/account', label: 'Overview', key: 'overview' },
  { href: '/account/orders', label: 'Orders', key: 'orders' },
  { href: '/account/subscriptions', label: 'Subscriptions', key: 'subscriptions' },
  { href: '/account/downloads', label: 'Downloads', key: 'downloads' },
  { href: '/account/addresses', label: 'Addresses', key: 'addresses' },
  { href: '/account/wishlist', label: 'Wishlist', key: 'wishlist' },
  { href: '/account/profile', label: 'Profile', key: 'profile' },
] as const;

export type AccountTab = (typeof LINKS)[number]['key'];

/** The frame around every signed-in account page: a menu, a reminder to confirm the email, and sign out. */
export function AccountShell({ customer, active, title, children, hide = [] }: { customer: Customer; active: AccountTab; title: string; children: ReactNode; hide?: readonly AccountTab[] }) {
  const links = LINKS.filter((l) => !hide.includes(l.key));
  return (
    <div className="mx-auto max-w-shell px-5 py-12 sm:px-6 md:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-muted">{customer.email}</p><h1 className="mt-1">{title}</h1></div>
        <SignOutButton />
      </div>
      {!customer.verified ? <p role="status" className="mt-6 rounded-input border border-warning p-3">Please confirm your email address with the link we sent you. Until then, orders you placed before creating this account are not shown here. <ResendVerify /></p> : null}
      <div className="mt-8 grid gap-8 md:grid-cols-[13rem_1fr]">
        <nav aria-label="Account" className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {links.map((l) => <Link key={l.key} href={l.href} aria-current={active === l.key ? 'page' : undefined} className={`whitespace-nowrap rounded-input px-3 py-2 ${active === l.key ? 'bg-raised font-medium text-ink' : 'text-muted hover:text-ink'}`}>{l.label}</Link>)}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
