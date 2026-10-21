/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import { getSetting } from '@/lib/data';
import { resumeSettings } from '@/modules/resume/settings';
import { PrintButton } from '@/components/site/client/PrintButton';

export async function generateMetadata(): Promise<Metadata> {
  const r = await getSetting(resumeSettings);
  return { title: r.name ? `${r.name}, resume` : 'Resume', description: r.headline || undefined };
}

type Row = Record<string, string | undefined>;

export default async function ResumePage() {
  const r = await getSetting(resumeSettings);
  const section = (title: string, children: React.ReactNode) => (
    <section className="border-t border-line pt-8 print:break-inside-avoid" aria-label={title}>
      <h2 className="text-h4">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
  return (
    <article className="mx-auto max-w-3xl space-y-10 px-5 pb-24 pt-16 sm:px-6 md:pt-20 print:pt-0">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          {r.photo ? <img src={r.photo} alt="" className="h-20 w-20 rounded-full object-cover print:hidden" /> : null}
          <div>
            <h1>{r.name || 'Your name'}</h1>
            {r.headline ? <p className="mt-1 text-lg">{r.headline}</p> : null}
            <p className="mt-2 text-sm text-muted">{[r.location, r.email, r.website].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <PrintButton />
      </header>
      {r.summary ? <p className="text-lg">{r.summary}</p> : null}
      {r.experience.length ? section('Experience', (
        <ol className="space-y-6">
          {(r.experience as Row[]).map((e, i) => (
            <li key={i}>
              <p className="font-semibold text-ink">{e.role}, {e.company}</p>
              <p className="text-sm text-muted">{[e.start, e.end].filter(Boolean).join(' to ')}</p>
              {e.body ? <ul className="mt-2 list-disc space-y-1 pl-5">{e.body.split('\n').filter(Boolean).map((line, j) => <li key={j}>{line.replace(/^[-•]\s*/, '')}</li>)}</ul> : null}
            </li>
          ))}
        </ol>
      )) : null}
      {r.education.length ? section('Education', (
        <ul className="space-y-3">{(r.education as Row[]).map((e, i) => <li key={i}><span className="font-semibold text-ink">{e.school}</span>{e.degree ? `, ${e.degree}` : ''}{e.years ? <span className="block text-sm text-muted">{e.years}</span> : null}</li>)}</ul>
      )) : null}
      {r.skills.length ? section('Skills', <ul className="flex flex-wrap gap-2">{r.skills.map((s) => <li key={s} className="rounded-full border border-line px-3 py-1 text-sm">{s}</li>)}</ul>) : null}
      {r.certifications.length ? section('Certifications', <ul className="space-y-2">{(r.certifications as Row[]).map((c, i) => <li key={i}><span className="font-medium text-ink">{c.name}</span>{c.issuer ? `, ${c.issuer}` : ''}{c.year ? ` (${c.year})` : ''}</li>)}</ul>) : null}
      {r.languages.length ? section('Languages', <p>{r.languages.join(', ')}</p>) : null}
    </article>
  );
}
