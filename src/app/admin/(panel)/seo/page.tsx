import Link from 'next/link';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { getResource } from '@/lib/admin/registry';
import { publicPathFor } from '@/lib/admin/preview';
import { isOn } from '@/lib/modules/server';
import { SEO_KINDS } from '@/lib/seo/context';
import { PageHeader } from '@/components/admin/ui';
import { RescoreButton } from './rescore-button';

export const metadata = { title: 'SEO overview' };
export const dynamic = 'force-dynamic';

type Row = { resource: string; label: string; id: string; title: string; path: string | null; score: number | null; keyword: string; titleLen: number; descLen: number; noindex: boolean; excluded: boolean; schema: string; fixes: string[]; status: string };

const FILTERS: Record<string, { label: string; test: (r: Row, dupes: Set<string>) => boolean }> = {
  all: { label: 'All', test: () => true },
  work: { label: 'Needs work (below 70)', test: (r) => (r.score ?? 0) < 70 },
  nodesc: { label: 'No description', test: (r) => r.descLen === 0 },
  nokw: { label: 'No keyword', test: (r) => !r.keyword },
  dupe: { label: 'Duplicate keyword', test: (r, d) => Boolean(r.keyword) && d.has(r.keyword.toLowerCase()) },
  noindex: { label: 'Hidden from search', test: (r) => r.noindex },
};
const SCHEMA: Record<string, string> = { pages: 'WebPage', posts: 'BlogPosting', projects: 'CreativeWork', 'case-studies': 'Article', apps: 'SoftwareApplication', categories: 'CollectionPage' };

/** One table of every page-like record with its score, lengths, index state and first fixes. Lowest score first. */
export default async function SeoOverview({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireAreaPage('seo');
  const filter = FILTERS[(await searchParams).filter ?? 'all'] ? ((await searchParams).filter ?? 'all') : 'all';
  const rows: Row[] = [];
  for (const resourceId of Object.keys(SEO_KINDS)) {
    const def = getResource(resourceId);
    if (!def || !(await isOn(def.module))) continue;
    const delegate = (getDb() as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>)[def.model];
    const list = (await delegate?.findMany({ where: def.softDelete ? { deletedAt: null } : {}, take: 1000 })) ?? [];
    for (const r of list) {
      const seo = (r.seo ?? {}) as Record<string, unknown>;
      const title = String(seo.title || r[def.titleField] || '');
      rows.push({
        resource: def.id, label: def.label, id: String(r.id), title: String(r[def.titleField] ?? ''), path: publicPathFor(def.publicPath, r),
        score: typeof seo.score === 'number' ? seo.score : null, keyword: String(seo.focusKeyword ?? ''), titleLen: title.length, descLen: String(seo.description ?? '').length,
        noindex: seo.noindex === true, excluded: seo.sitemap === 'exclude', schema: seo.schemaType && seo.schemaType !== 'auto' ? String(seo.schemaType) : (SCHEMA[def.id] ?? 'WebPage'),
        fixes: Array.isArray(seo.fixes) ? (seo.fixes as string[]) : [], status: String(def.statusField ? r[def.statusField] : 'PUBLISHED'),
      });
    }
  }
  const counts = new Map<string, number>();
  for (const r of rows) if (r.keyword) counts.set(r.keyword.toLowerCase(), (counts.get(r.keyword.toLowerCase()) ?? 0) + 1);
  const dupes = new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
  const shown = rows.filter((r) => (FILTERS[filter] as (typeof FILTERS)['all']).test(r, dupes)).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  const average = rows.length ? Math.round(rows.reduce((n, r) => n + (r.score ?? 0), 0) / rows.length) : 0;
  const tone = (n: number | null) => (n === null ? 'border-line text-muted' : n >= 80 ? 'border-success text-success' : n >= 60 ? 'border-warning text-warning' : 'border-danger text-danger');

  return (
    <div className="max-w-7xl">
      <PageHeader title="SEO overview" description={`Every page, post and project with its SEO score. Average score: ${average}/100. The score is advice; it never blocks publishing.`} actions={<RescoreButton />} />
      <nav aria-label="Filters" className="mt-6 flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([key, f]) => (
          <Link key={key} href={key === 'all' ? '/admin/seo' : `/admin/seo?filter=${key}`} aria-current={filter === key ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${filter === key ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink hover:bg-raised'}`}>
            {f.label} ({rows.filter((r) => f.test(r, dupes)).length})
          </Link>
        ))}
      </nav>
      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>{['Score', 'Item', 'Type', 'Focus keyword', 'Title', 'Description', 'Index', 'Schema', 'First fixes'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={9} className="px-3 py-10 text-center text-muted">Nothing matches this filter.</td></tr> : null}
            {shown.map((r) => (
              <tr key={`${r.resource}-${r.id}`} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2"><span className={`inline-flex min-w-10 justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone(r.score)}`}>{r.score ?? '?'}</span></td>
                <td className="px-3 py-2"><Link href={`/admin/${r.resource}/${encodeURIComponent(r.id)}`} className="font-medium text-ink hover:underline">{r.title || 'Untitled'}</Link>{r.path ? <span className="block text-xs text-muted">{r.path}</span> : null}{r.status !== 'PUBLISHED' ? <span className="block text-xs text-warning">{r.status.toLowerCase()}</span> : null}</td>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2">{r.keyword || <span className="text-muted">None</span>}{r.keyword && dupes.has(r.keyword.toLowerCase()) ? <span className="block text-xs text-danger">used twice</span> : null}</td>
                <td className={`px-3 py-2 tabular-nums ${r.titleLen >= 30 && r.titleLen <= 65 ? '' : 'text-warning'}`}>{r.titleLen}</td>
                <td className={`px-3 py-2 tabular-nums ${r.descLen >= 110 && r.descLen <= 170 ? '' : 'text-warning'}`}>{r.descLen}</td>
                <td className="px-3 py-2">{r.noindex ? <span className="text-warning">Hidden</span> : r.excluded ? 'Not in sitemap' : 'Listed'}</td>
                <td className="px-3 py-2">{r.schema}</td>
                <td className="px-3 py-2"><ul className="space-y-1">{r.fixes.slice(0, 2).map((f) => <li key={f}>{f}</li>)}</ul></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
