'use client';

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';

interface Props {
  children: ReactNode;
  columns: number;
  autoplay: boolean;
  interval: number;
  arrows: boolean;
  dots: boolean;
  label: string;
}

/**
 * Accessible carousel on native scroll snapping: swipe, keyboard arrows, optional autoplay that pauses on
 * hover, focus and for reduced motion. The track pads itself so shadows and badges are not clipped.
 */
export function Carousel({ children, columns, autoplay, interval, arrows, dots, label }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = Children.count(children);
  const basis = { 1: '100%', 2: 'calc(50% - 0.625rem)', 3: 'calc(33.333% - 0.84rem)', 4: 'calc(25% - 0.94rem)' }[Math.min(4, Math.max(1, columns)) as 1 | 2 | 3 | 4];

  const go = useCallback((to: number) => {
    const el = track.current;
    if (!el) return;
    const next = (to + count) % count;
    const child = el.children[next] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft - 16, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setIndex(next);
  }, [count]);

  useEffect(() => {
    if (!autoplay || paused || count < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => go(index + 1), Math.min(30, Math.max(2, interval)) * 1000);
    return () => clearInterval(timer);
  }, [autoplay, paused, interval, index, count, go]);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const items = [...el.children] as HTMLElement[];
    const nearest = items.reduce((best, item, i) => (Math.abs(item.offsetLeft - el.offsetLeft - 16 - el.scrollLeft) < Math.abs((items[best]?.offsetLeft ?? 0) - el.offsetLeft - 16 - el.scrollLeft) ? i : best), 0);
    setIndex(nearest);
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <div ref={track} className="carousel-track" onScroll={onScroll} tabIndex={0} aria-live={autoplay && !paused ? 'off' : 'polite'}>
        {Children.map(children, (child, i) => (
          <div role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} style={{ width: `min(85vw, ${basis})` }}>
            {child}
          </div>
        ))}
      </div>
      {(arrows || dots) && count > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-3">
          {arrows ? (
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous" className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink hover:bg-raised">
              <Icon name="chevron-left" />
            </button>
          ) : null}
          {dots ? (
            <div className="flex gap-1">
              {Array.from({ length: count }, (_, i) => (
                <button key={i} type="button" onClick={() => go(i)} aria-label={`Go to slide ${i + 1}`} aria-current={i === index} className="grid h-11 w-6 place-items-center">
                  <span className={`block h-2 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-2 bg-line'}`} />
                </button>
              ))}
            </div>
          ) : null}
          {arrows ? (
            <button type="button" onClick={() => go(index + 1)} aria-label="Next" className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink hover:bg-raised">
              <Icon name="chevron-right" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
