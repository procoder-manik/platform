import type { Area } from '@/lib/auth/areas';
import type { NavItem } from '@/lib/modules/types';
import type { FieldDef, FieldOption } from './fields';

export type ColumnKind = 'text' | 'title' | 'status' | 'boolean' | 'date' | 'money' | 'thumb' | 'tags' | 'code' | 'number' | 'seoScore' | 'orderStatus' | 'subscriptionStatus';

export interface ColumnDef {
  field: string;
  label: string;
  kind: ColumnKind;
  sortable?: boolean;
  /** Hidden until the owner picks it in the column chooser. */
  hiddenByDefault?: boolean;
}

export interface FilterDef {
  field: string;
  label: string;
  options: readonly FieldOption[];
  /** How the value is compared: plain equality (default) or "has" for array columns. */
  mode?: 'equals' | 'has';
  type?: 'string' | 'boolean';
}

export interface DuplicateRules {
  /** Fields set back to their default on the copy (counters, hits). */
  reset?: readonly string[];
  /** Fields that must stay unique: a suffix is added on the copy. */
  unique?: readonly string[];
}

/**
 * A resource is a list in the admin with an editor. It is plain data so it can be read by generic
 * screens, tests and the docs generator. Server-only behaviour (hashing, checks) lives in hooks,
 * registered separately in a *.server.ts file.
 */
export interface ResourceDef {
  /** URL segment: /admin/<id>. */
  id: string;
  label: string;
  labelPlural: string;
  description: string;
  module: string;
  area: Area;
  /** Prisma delegate name, for example "page". */
  model: string;
  /** Name used in revisions and the audit log. */
  entity: string;
  nav?: { group: NavItem['group']; label?: string };
  fields: readonly FieldDef[];
  /** Editor tab order. Fields without a tab go to "Content". */
  tabs?: readonly string[];
  titleField: string;
  slugField?: string;
  /** Column holding DRAFT, SCHEDULED or PUBLISHED. */
  statusField?: string;
  /** Records go to Trash (deletedAt) before they are deleted for good. */
  softDelete?: boolean;
  revisions?: boolean;
  duplicate?: false | DuplicateRules;
  columns: readonly ColumnDef[];
  searchFields: readonly string[];
  filters?: readonly FilterDef[];
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  quickEdit?: readonly string[];
  csv?: { columns: readonly string[]; importKey?: string };
  /** List only, no editor (audit log). */
  readOnly?: boolean;
  creatable?: boolean;
  /** For read-only lists: an "Add" button that opens a dedicated screen (for example /admin/subscriptions/new). */
  addHref?: string;
  deletable?: boolean;
  /** Public address pattern, for "View live", preview links and automatic 301s. {slug} is replaced. */
  publicPath?: string;
  /** An extra link on each row, for example "Create redirect" on the 404 log. {field} is replaced with the row value. */
  rowLink?: { label: string; href: string };
  /** Fixed filter applied to every query, for example staff users only. */
  baseWhere?: Record<string, unknown>;
  /** Values for a new record. */
  defaults?: Record<string, unknown>;
  /** Columns holding media URLs or JSON that may contain them, for the media usage list. */
  mediaColumns?: readonly string[];
}

export function defineResource(def: ResourceDef): ResourceDef {
  return def;
}

/** The parts of a resource the browser needs. */
export type ClientResource = Omit<ResourceDef, 'baseWhere'>;

export function toClientResource(def: ResourceDef): ClientResource {
  const { baseWhere: _baseWhere, ...rest } = def;
  return rest;
}

export function tabsOf(def: ResourceDef | ClientResource): string[] {
  const used = [...new Set(def.fields.map((f) => f.tab ?? 'Content'))];
  const order = def.tabs ?? ['Content', 'Media', 'SEO', 'Social', 'Schema', 'Advanced'];
  return [...order.filter((t) => used.includes(t)), ...used.filter((t) => !order.includes(t))];
}
