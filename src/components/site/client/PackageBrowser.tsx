'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { PublicService } from '@/lib/data/services';
import { formatMinor } from '@/lib/checkout/money';
import { PERIOD_LABEL, allowedPeriods, quoteFor, type Period } from '@/lib/checkout/pricing';
import { Icon } from '../Icon';

interface Props {
  services: PublicService[];
  defaultPeriod: 'monthly' | 'yearly';
  showEffectiveMonthly: boolean;
  checkoutOn: boolean;
  contactHref: string;
  /** Only this service, without tabs (the Packages block). */
  headingLevel?: 'h2' | 'h3';
}

/** Service tabs, a monthly and yearly switch, and package cards with their savings. Prices shown here are for display only: checkout recomputes everything. */
export function PackageBrowser({ services, defaultPeriod, showEffectiveMonthly, checkoutOn, contactHref, headingLevel = 'h3' }: Props) {
  const [active, setActive] = useState(0);
  const [yearly, setYearly] = useState(defaultPeriod === 'yearly');
  const base = useId();
  const service = services[active] ?? services[0];
  if (!service) return null;
  const H = headingLevel;
  const hasChoice = service.packages.some((p) => p.monthlyYearly);

  return (
    <div>
      {services.length > 1 ? (
        <div role="tablist" aria-label="Services" className="mb-8 flex flex-wrap gap-2">
          {services.map((s, i) => (
            <button key={s.id} id={`${base}-t${i}`} role="tab" type="button" aria-selected={active === i} aria-controls={`${base}-p${i}`} tabIndex={active === i ? 0 : -1} onClick={() => setActive(i)}
              onKeyDown={(e) => { if (e.key === 'ArrowRight') setActive((active + 1) % services.length); if (e.key === 'ArrowLeft') setActive((active - 1 + services.length) % services.length); }}
              className={`min-h-11 rounded-full border px-5 font-medium ${active === i ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink hover:bg-raised'}`}>
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      <div id={`${base}-p${active}`} role={services.length > 1 ? 'tabpanel' : undefined} aria-labelledby={services.length > 1 ? `${base}-t${active}` : undefined}>
        {service.summary ? <p className="mb-6 max-w-2xl text-lg">{service.summary}</p> : null}
        {hasChoice ? (
          <div className="mb-8 flex items-center gap-3">
            <span className={!yearly ? 'font-semibold text-ink' : 'text-muted'}>Monthly</span>
            <button type="button" role="switch" aria-checked={yearly} aria-label="Bill yearly" onClick={() => setYearly(!yearly)} className={`relative h-8 w-14 rounded-full border border-line ${yearly ? 'bg-primary' : 'bg-raised'}`}>
              <span aria-hidden="true" className={`absolute top-1 h-5 w-5 rounded-full bg-surface transition-transform ${yearly ? 'translate-x-8' : 'translate-x-1'}`} />
            </button>
            <span className={yearly ? 'font-semibold text-ink' : 'text-muted'}>Yearly</span>
          </div>
        ) : null}

        <ul className="grid grid-cols-1 gap-6 text-left sm:grid-cols-2 lg:grid-cols-3">
          {service.packages.map((p) => {
            const periods = allowedPeriods(p);
            const period: Period = p.monthlyYearly ? (yearly ? 'yearly' : 'monthly') : (periods[0] as Period);
            const quote = quoteFor(p, period);
            const buy = p.mode === 'buy' && checkoutOn;
            const href = buy ? `/checkout/${p.slug}${period !== 'once' ? `?period=${period}` : ''}` : `${contactHref}${contactHref.includes('?') ? '&' : '?'}package=${encodeURIComponent(p.name)}&service=${encodeURIComponent(service.name)}`;
            return (
              <li key={p.id} className={`relative flex flex-col rounded-card border bg-surface p-6 ${p.popular ? 'border-primary shadow-card' : 'border-line'}`}>
                {p.popular ? <span className="absolute -top-3 left-5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-ink">Popular</span> : null}
                <H className="text-h5">{p.name}</H>
                {p.tagline ? <p className="mt-1 text-sm">{p.tagline}</p> : null}
                <p className="mt-5" aria-live="polite">
                  {p.mode === 'quote' && !quote.unit ? <span className="font-display text-h3 font-semibold text-ink">Custom</span> : (
                    <>
                      {p.mode === 'quote' || quote.unitMax ? <span className="mr-1 text-sm text-muted">{quote.unitMax ? '' : 'From'}</span> : null}
                      <span className="font-display text-h2 font-semibold text-ink">{formatMinor(quote.unit, p.currency)}</span>
                      {quote.unitMax ? <span className="font-display text-h4 text-ink"> to {formatMinor(quote.unitMax, p.currency)}</span> : null}
                      <span className="ml-1 text-muted">{PERIOD_LABEL[period]}</span>
                    </>
                  )}
                </p>
                {quote.saving ? <p className="mt-1 text-sm font-medium text-success">You save {formatMinor(quote.saving.amount, p.currency)} ({quote.saving.pct}%)</p> : null}
                {showEffectiveMonthly && quote.effectiveMonthly && period === 'yearly' ? <p className="text-sm text-muted">That is {formatMinor(quote.effectiveMonthly, p.currency)} a month</p> : null}
                {p.deliveryDays ? <p className="mt-2 text-sm text-muted">Ready in {p.deliveryDays} {p.deliveryDays === 1 ? 'day' : 'days'}</p> : null}
                {p.features.length ? (
                  <ul className="mt-5 flex-1 space-y-2">
                    {p.features.map((f) => <li key={f} className="flex gap-2"><span className="mt-0.5 text-success"><Icon name="check" className="h-4 w-4" /></span>{f}</li>)}
                  </ul>
                ) : <div className="flex-1" />}
                <Link href={href} className={`btn mt-6 ${p.popular ? 'btn-primary' : 'btn-ghost'}`}>{buy ? 'Buy now' : 'Request a quote'}</Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
