'use client';

import { useEffect, useState } from 'react';
import type { Heading } from '@/lib/richtext/render';

/** Thin bar at the top that fills as the reader scrolls through the article. */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      setP(total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [targetId]);
  return <div aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-1 origin-left bg-primary" style={{ transform: `scaleX(${p})` }} />;
}

/**
 * Contents list from the article's H2 to H4. A sticky sidebar on desktop; on phones a card that shows the
 * current section and opens the full list. The current section is highlighted as the reader scrolls.
 */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState(headings[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter(Boolean) as HTMLElement[];
    if (!els.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [headings]);
  if (headings.length < 2) return null;
  const current = headings.find((h) => h.id === active);
  const list = (
    <ol className="space-y-1 text-sm">
      {headings.map((h) => (
        <li key={h.id} style={{ paddingLeft: `${(h.level - 2) * 0.85}rem` }}>
          <a href={`#${h.id}`} onClick={() => setOpen(false)} aria-current={h.id === active ? 'location' : undefined} className={`block border-l-2 py-1 pl-3 ${h.id === active ? 'border-primary font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav aria-label="Contents" className="hidden lg:block">
        <p className="mb-2 text-sm font-semibold text-ink">Contents</p>
        {list}
      </nav>
      <nav aria-label="Contents" className="sticky top-16 z-20 -mx-5 mb-6 border-y border-line bg-surface/95 px-5 backdrop-blur lg:hidden">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm">
          <span className="truncate"><span className="text-muted">Contents: </span><span className="font-medium text-ink">{current?.text ?? headings[0]?.text}</span></span>
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {open ? <div className="max-h-[60vh] overflow-auto pb-4">{list}</div> : null}
      </nav>
    </>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink hover:bg-raised"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt('Copy this address:', url);
        }
      }}
    >
      {done ? 'Copied' : 'Copy link'}
    </button>
  );
}

/**
 * Full-page screenshot inside a browser frame. On hover (or tap on touch screens) it scrolls to the bottom
 * at a steady speed, then back. No movement for visitors who prefer reduced motion.
 */
export function ScrollShot({ src, alt, speed, href }: { src: string; alt: string; speed: number; href?: string | null }) {
  const [distance, setDistance] = useState(0);
  const [on, setOn] = useState(false);
  const duration = distance > 0 ? Math.max(0.6, distance / Math.max(100, speed)) : 0;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-1.5 border-b border-line bg-raised px-3 py-2" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-danger opacity-70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning opacity-70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success opacity-70" />
        {href ? <span className="ml-3 truncate text-xs text-muted">{href.replace(/^https?:\/\//, '')}</span> : null}
      </div>
      <div
        className="relative aspect-[16/10] overflow-hidden"
        onMouseEnter={() => setOn(true)}
        onMouseLeave={() => setOn(false)}
        onTouchStart={() => setOn((v) => !v)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute left-0 top-0 w-full motion-reduce:!transform-none"
          onLoad={(e) => {
            const img = e.currentTarget;
            const frame = img.parentElement?.clientHeight ?? 0;
            setDistance(Math.max(0, img.clientHeight - frame));
          }}
          style={{ transform: on ? `translateY(-${distance}px)` : 'translateY(0)', transition: `transform ${on ? duration : Math.min(duration, 1.2)}s ${on ? 'linear' : 'ease-out'}` }}
        />
      </div>
    </div>
  );
}
