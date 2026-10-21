/** Parses list screen search params into a safe query. Pure, so it is unit tested. */
import type { ResourceDef } from './resource';

export interface ListQuery {
  q: string;
  view: 'all' | 'trash';
  sort: { field: string; dir: 'asc' | 'desc' };
  page: number;
  pageSize: number;
  filters: Record<string, string>;
  columns: string[];
}

export const PAGE_SIZES = [25, 50, 100] as const;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function parseListQuery(def: Pick<ResourceDef, 'columns' | 'defaultSort' | 'filters' | 'softDelete'>, params: Params): ListQuery {
  const sortable = new Set([def.defaultSort.field, ...def.columns.filter((c) => c.sortable).map((c) => c.field)]);
  const [rawField, rawDir] = one(params.sort).split(':');
  const sort =
    rawField && sortable.has(rawField)
      ? { field: rawField, dir: rawDir === 'asc' ? ('asc' as const) : ('desc' as const) }
      : def.defaultSort;

  const pageSize = Number(one(params.size));
  const filters: Record<string, string> = {};
  for (const f of def.filters ?? []) {
    const value = one(params[`f_${f.field}`]);
    if (value && f.options.some((o) => o.value === value)) filters[f.field] = value;
  }
  const known = new Set(def.columns.map((c) => c.field));
  const requested = one(params.cols).split(',').filter((c) => known.has(c));

  return {
    q: one(params.q).trim().slice(0, 200),
    view: def.softDelete && one(params.view) === 'trash' ? 'trash' : 'all',
    sort,
    page: Math.max(1, Math.min(10_000, Number.parseInt(one(params.page), 10) || 1)),
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 25,
    filters,
    columns: requested.length > 0 ? requested : def.columns.filter((c) => !c.hiddenByDefault).map((c) => c.field),
  };
}

/** Builds a list URL from a query, dropping defaults so links stay short. */
export function listHref(resourceId: string, query: Partial<ListQuery> & { sortString?: string }, base: ListQuery): string {
  const merged = { ...base, ...query };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', merged.q);
  if (merged.view === 'trash') params.set('view', 'trash');
  params.set('sort', `${merged.sort.field}:${merged.sort.dir}`);
  if (merged.page > 1) params.set('page', String(merged.page));
  if (merged.pageSize !== 25) params.set('size', String(merged.pageSize));
  for (const [k, v] of Object.entries(merged.filters)) params.set(`f_${k}`, v);
  if (query.columns) params.set('cols', merged.columns.join(','));
  return `/admin/${resourceId}?${params.toString()}`;
}
