import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getResource } from '@/lib/admin/registry';
import { listHref, parseListQuery, PAGE_SIZES } from '@/lib/admin/query';
import { listRecords, resolveFields, trashCount } from '@/lib/admin/repo';
import { toClientResource } from '@/lib/admin/resource';
import { getSavedViews } from '@/lib/admin/views';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';
import { ResourceTable } from '@/components/admin/list/ResourceTable';
import { ImportCsv } from '@/components/admin/list/ImportCsv';
import { PageHeader, inputClass } from '@/components/admin/ui';

type Props = { params: Promise<{ resource: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
  return { title: getResource((await params).resource)?.labelPlural ?? 'Not found' };
}

/** The generic list screen, drawn from a resource declaration. */
export default async function ResourceListPage({ params, searchParams }: Props) {
  const def = getResource((await params).resource);
  if (!def) notFound();
  const staff = await requireAreaPage(def.area);
  if (!(await isOn(def.module))) notFound();

  const query = parseListQuery(def, await searchParams);
  const [{ rows, total }, trash, site, savedViews, fields] = await Promise.all([
    listRecords(def, query),
    trashCount(def),
    getSetting(siteSettings),
    getSavedViews(staff.id, def.id),
    resolveFields(def.fields),
  ]);
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const current = listHref(def.id, { columns: query.columns }, query);
  const columnHrefs = Object.fromEntries(
    def.columns.map((c) => {
      const next = query.columns.includes(c.field) ? query.columns.filter((f) => f !== c.field) : def.columns.map((x) => x.field).filter((f) => f === c.field || query.columns.includes(f));
      return [c.field, listHref(def.id, { columns: next.length ? next : query.columns }, query)];
    }),
  );
  const quickFields = fields.filter((f) => def.quickEdit?.includes(f.name));

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={def.labelPlural}
        description={def.description}
        actions={
          <>
            {def.csv?.importKey ? <ImportCsv resourceId={def.id} columns={def.csv.columns} importKey={def.csv.importKey} /> : null}
            {def.creatable !== false && !def.readOnly ? (
              <Link href={`/admin/${def.id}/new`} className="inline-flex min-h-10 items-center rounded-button bg-primary px-4 text-sm font-medium text-primary-ink">
                Add {def.label.toLowerCase()}
              </Link>
            ) : def.addHref ? (
              <Link href={def.addHref} className="inline-flex min-h-10 items-center rounded-button bg-primary px-4 text-sm font-medium text-primary-ink">
                Add {def.label.toLowerCase()}
              </Link>
            ) : null}
          </>
        }
      />

      {def.softDelete ? (
        <nav aria-label="Views" className="mt-6 flex gap-4 border-b border-line text-sm">
          <Link href={listHref(def.id, { view: 'all', page: 1 }, query)} aria-current={query.view === 'all' ? 'page' : undefined} className={`-mb-px border-b-2 pb-2 ${query.view === 'all' ? 'border-primary text-ink' : 'border-transparent text-muted'}`}>
            All
          </Link>
          <Link href={listHref(def.id, { view: 'trash', page: 1 }, query)} aria-current={query.view === 'trash' ? 'page' : undefined} className={`-mb-px border-b-2 pb-2 ${query.view === 'trash' ? 'border-primary text-ink' : 'border-transparent text-muted'}`}>
            Trash ({trash})
          </Link>
        </nav>
      ) : null}

      <form method="get" role="search" className="mt-4 flex flex-wrap items-end gap-2">
        {query.view === 'trash' ? <input type="hidden" name="view" value="trash" /> : null}
        <input type="hidden" name="cols" value={query.columns.join(',')} />
        <label className="min-w-56 flex-1">
          <span className="block text-xs font-medium text-muted">Search</span>
          <input name="q" defaultValue={query.q} className={inputClass} placeholder={`Search ${def.labelPlural.toLowerCase()}`} />
        </label>
        {(def.filters ?? []).map((f) => (
          <label key={f.field}>
            <span className="block text-xs font-medium text-muted">{f.label}</span>
            <select name={`f_${f.field}`} defaultValue={query.filters[f.field] ?? ''} className={inputClass}>
              <option value="">Any</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <span className="block text-xs font-medium text-muted">Sort</span>
          <select name="sort" defaultValue={`${query.sort.field}:${query.sort.dir}`} className={inputClass}>
            {[def.defaultSort.field, ...def.columns.filter((c) => c.sortable).map((c) => c.field)]
              .filter((v, i, a) => a.indexOf(v) === i)
              .flatMap((field) => {
                const label = def.columns.find((c) => c.field === field)?.label ?? field;
                return [
                  <option key={`${field}:asc`} value={`${field}:asc`}>{label}, A to Z / oldest first</option>,
                  <option key={`${field}:desc`} value={`${field}:desc`}>{label}, Z to A / newest first</option>,
                ];
              })}
          </select>
        </label>
        <label>
          <span className="block text-xs font-medium text-muted">Per page</span>
          <select name="size" defaultValue={String(query.pageSize)} className={inputClass}>
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-10 rounded-button border border-line bg-surface px-4 text-sm text-ink">
          Apply
        </button>
      </form>

      <div className="mt-4">
        <ResourceTable
          resource={toClientResource(def)}
          quickFields={quickFields}
          rows={rows}
          columns={query.columns}
          view={query.view}
          timeZone={site.timeZone}
          isAdmin={staff.areas.includes('*')}
          currentHref={current}
          columnHrefs={columnHrefs}
          savedViews={savedViews}
        />
      </div>

      <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">
          {total} {total === 1 ? 'item' : 'items'}, page {query.page} of {pages}
        </span>
        <span className="flex gap-2">
          {query.page > 1 ? <Link className="rounded-button border border-line px-3 py-2" href={listHref(def.id, { page: query.page - 1 }, query)}>Previous</Link> : null}
          {query.page < pages ? <Link className="rounded-button border border-line px-3 py-2" href={listHref(def.id, { page: query.page + 1 }, query)}>Next</Link> : null}
        </span>
      </nav>
    </div>
  );
}
