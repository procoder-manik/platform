'use client';

import { useEffect, useState } from 'react';
import { seoDraftAction } from '@/lib/seo/actions';
import type { SeoReport } from '@/lib/seo/context';
import { getPath } from '@/lib/admin/fields';
import { Button, Notice } from '../ui';

interface Props {
  resourceId: string;
  id: string | null;
  values: Record<string, unknown>;
  fieldNames: string[];
  tab: 'SEO' | 'Social' | 'Schema';
  siteName: string;
  siteUrl: string;
  path: string | null;
}

const toneClass = (score: number) => (score >= 80 ? 'border-success text-success' : score >= 60 ? 'border-warning text-warning' : 'border-danger text-danger');

function Meter({ label, length, min, max }: { label: string; length: number; min: number; max: number }) {
  const ok = length >= min && length <= max;
  return (
    <p className="text-xs">
      {label}: <span className={ok ? 'text-success' : 'text-warning'}>{length} characters</span> <span className="text-muted">(aim for {min} to {max})</span>
    </p>
  );
}

/** Live SEO score and Google preview, social preview, and the schema panel. Updates while the owner types. */
export function SeoPanel({ resourceId, id, values, fieldNames, tab, siteName, siteUrl, path }: Props) {
  const [report, setReport] = useState<SeoReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      const payload: Record<string, unknown> = {};
      for (const name of fieldNames) payload[name] = getPath(values, name);
      const result = await seoDraftAction(resourceId, id, payload);
      if (result.ok) {
        setReport(result.report);
        setError(null);
      } else setError(result.message);
    }, 800);
    return () => clearTimeout(t);
  }, [values, resourceId, id, fieldNames, tick]);

  const seo = (values.seo ?? {}) as Record<string, string>;
  const title = String(seo.title || values.title || values.name || '');
  const description = String(seo.description || values.excerpt || values.summary || '');
  const url = `${siteUrl.replace(/^https?:\/\//, '')}${path ?? ''}`;

  if (error) return <Notice tone="warning">SEO check paused: {error}</Notice>;
  if (!report) return <p className="text-sm text-muted" aria-busy="true">Checking SEO…</p>;

  if (tab === 'Social') {
    const image = seo.ogImage || String(values.cover || values.bannerImage || '') || `/og?title=${encodeURIComponent(seo.ogTitle || title)}`;
    return (
      <div className="max-w-lg overflow-hidden rounded-card border border-line bg-surface" aria-label="Share preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="aspect-[1200/630] w-full object-cover" />
        <div className="p-3">
          <p className="text-xs uppercase text-muted">{url.split('/')[0]}</p>
          <p className="font-semibold text-ink">{seo.ogTitle || title}</p>
          <p className="line-clamp-2 text-sm">{seo.ogDescription || description}</p>
        </div>
      </div>
    );
  }

  if (tab === 'Schema') {
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': report.schema.map((n) => n.json) }, null, 2);
    return (
      <section aria-label="Schema panel" className="space-y-3 rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Structured data</h2>
          <div className="flex gap-2">
            <Button onClick={() => setTick((n) => n + 1)}>Rebuild</Button>
            <Button onClick={() => void navigator.clipboard?.writeText(json)}>Copy JSON</Button>
            {path ? <a className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink" href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(siteUrl + path)}`} target="_blank" rel="noreferrer">Rich Results Test</a> : null}
          </div>
        </div>
        <ul className="space-y-2">
          {report.schema.map((n, i) => (
            <li key={i} className="rounded-input border border-line p-3 text-sm">
              <p><span className="font-semibold text-ink">{n.type}</span>: {n.explanation}</p>
              {n.warnings.map((w) => <p key={w} className="mt-1 text-warning">{w}</p>)}
            </li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm text-primary">Show the JSON</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-input bg-raised p-3 font-mono text-xs">{json}</pre>
        </details>
      </section>
    );
  }

  const groups = [...new Set(report.checks.map((c) => c.group))];
  return (
    <section aria-label="SEO score" className="space-y-4 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className={`grid h-16 w-16 place-items-center rounded-full border-4 font-display text-xl font-semibold ${toneClass(report.score)}`} aria-label={`SEO score ${report.score} out of 100`}>{report.score}</span>
        <div>
          <p className="font-semibold text-ink">SEO score {report.score}/100</p>
          <p className="text-sm">{report.fixes[0] ? `Next: ${report.fixes[0]}` : 'Nothing left to fix.'}</p>
          <p className="text-xs text-muted">Advice only. It never stops you publishing.</p>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Google preview</p>
          <div role="radiogroup" aria-label="Preview device" className="inline-flex rounded-button border border-line p-0.5 text-xs">
            {(['desktop', 'phone'] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`min-h-8 rounded-button px-3 ${device === d ? 'bg-primary text-primary-ink' : ''}`}>{d === 'desktop' ? 'Desktop' : 'Phone'}</button>)}
          </div>
        </div>
        <div className={`rounded-input border border-line bg-base p-3 ${device === 'phone' ? 'max-w-sm' : 'max-w-2xl'}`}>
          <p className="truncate text-xs text-muted">{siteName} · {url}</p>
          <p className="mt-0.5 line-clamp-1 text-lg text-primary">{title || 'Page title'}</p>
          <p className="line-clamp-2 text-sm">{description || 'Add a meta description so you control this text.'}</p>
        </div>
        <div className="mt-2 space-y-0.5">
          <Meter label="Title" length={title.length} min={50} max={60} />
          <Meter label="Description" length={description.length} min={120} max={160} />
        </div>
      </div>
      {groups.map((g) => (
        <div key={g}>
          <p className="text-sm font-medium text-ink">{g}</p>
          <ul className="mt-1 space-y-1">
            {report.checks.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="flex gap-2 text-sm">
                <span aria-hidden="true" className={c.pass ? 'text-success' : 'text-danger'}>{c.pass ? '✓' : '✗'}</span>
                <span><span className="sr-only">{c.pass ? 'Passed: ' : 'To fix: '}</span>{c.pass ? c.label : c.tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {report.suggestions.length ? (
        <div>
          <p className="text-sm font-medium text-ink">Pages you could link to</p>
          <ul className="mt-1 space-y-1 text-sm">{report.suggestions.map((s) => <li key={s.href}><code className="text-xs">{s.href}</code> {s.title}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}
