/** Builds the data for a duplicate. Pure: the caller supplies the set of values already taken. */
import { getPath } from './fields';
import type { ResourceDef } from './resource';
import { uniqueSlug } from './slug';

const SYSTEM = ['id', 'createdAt', 'updatedAt', 'deletedAt'];

export function duplicateData(
  def: Pick<ResourceDef, 'titleField' | 'slugField' | 'statusField' | 'duplicate' | 'defaults'> & { primaryKeyEditable?: boolean },
  record: Record<string, unknown>,
  taken: Record<string, ReadonlySet<string>>,
): Record<string, unknown> {
  const rules = def.duplicate || {};
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) if (!SYSTEM.includes(k) || (k === 'id' && def.primaryKeyEditable)) data[k] = v;

  const title = getPath(record, def.titleField);
  if (typeof title === 'string' && !(rules.unique ?? []).includes(def.titleField)) data[def.titleField] = `${title} (copy)`;

  for (const field of rules.reset ?? []) data[field] = def.defaults?.[field] ?? null;
  if (def.statusField) data[def.statusField] = 'DRAFT';
  if (def.statusField && 'publishAt' in record) data.publishAt = null;
  if ('publishedAt' in record) data.publishedAt = null;

  for (const field of rules.unique ?? []) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const set = taken[field] ?? new Set<string>();
    const isPath = value.startsWith('/');
    data[field] = isPath ? uniqueSlug(`${value.replace(/\/$/, '')}-copy`, set) : uniqueSlug(`${value}-copy`, set);
  }
  return data;
}
