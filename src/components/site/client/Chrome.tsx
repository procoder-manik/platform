'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';

export interface MenuLink {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

/** Light and dark switch. The choice is stored on the visitor's device. */
export function ThemeToggle() {
  const [mode, setMode] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    // Read the mode the head script applied, after hydration.
    const t = setTimeout(() => setMode(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'), 0);
    return () => clearTimeout(t);
  }, []);
  if (!mode) return <span className="h-11 w-11" aria-hidden="true" />;
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('theme', next);
        } catch {
          /* private mode: the choice lasts for this page only */
        }
        setMode(next);
      }}
    >
      <Icon name={mode === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export function MobileMenu({ links, style, button }: { links: MenuLink[]; style: 'drawer' | 'dropdown'; button?: { label: string; href: string } | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    document.body.style.overflow = style === 'drawer' ? 'hidden' : '';
    return () => {
      window.removeEventListener('keydown', close);
      document.body.style.overflow = '';
    };
  }, [open, style]);
  return (
    <div className="md:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)} className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised">
        <Icon name={open ? 'close' : 'menu'} />
      </button>
      {open ? (
        <>
          {style === 'drawer' ? <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 bg-ink/40" onClick={() => setOpen(false)} /> : null}
          <nav
            id="mobile-menu"
            aria-label="Main"
            className={style === 'drawer' ? 'fixed inset-y-0 right-0 z-50 w-[min(20rem,85vw)] overflow-auto bg-surface p-6 shadow-card' : 'absolute inset-x-0 top-full z-40 border-b border-line bg-surface p-5'}
            style={style === 'drawer' ? { paddingTop: 'max(1.5rem, env(safe-area-inset-top))' } : undefined}
          >
            {style === 'drawer' ? (
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="mb-4 ml-auto grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised">
                <Icon name="close" />
              </button>
            ) : null}
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center text-lg font-medium text-ink">{l.label}</Link>
                  {l.children?.length ? (
                    <ul className="ml-4 border-l border-line pl-3">
                      {l.children.map((c) => (
                        <li key={`${c.label}-${c.href}`}><Link href={c.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center text-body">{c.label}</Link></li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
            {button ? <Link href={button.href} onClick={() => setOpen(false)} className="btn btn-primary mt-6 w-full">{button.label}</Link> : null}
          </nav>
        </>
      ) : null}
    </div>
  );
}

/** Back to top with a reading-progress ring. Appears after scrolling. Stacks above the chat button on the same side. */
export function BackToTop({ side, stacked }: { side: 'left' | 'right'; stacked: boolean }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (progress < 0.08) return null;
  const c = 2 * Math.PI * 20;
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      className="fixed z-30 grid h-12 w-12 place-items-center rounded-full bg-surface text-ink shadow-card"
      style={{ [side]: 'max(1rem, env(safe-area-inset-' + side + '))', bottom: `calc(${stacked ? '5.5rem' : '1rem'} + env(safe-area-inset-bottom, 0px))` }}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 h-12 w-12 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
        <circle cx="24" cy="24" r="20" fill="none" className="text-primary" stroke="currentColor" strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} strokeLinecap="round" />
      </svg>
      <Icon name="arrow-up" className="h-5 w-5" />
    </button>
  );
}
