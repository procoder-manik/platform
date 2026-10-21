/**
 * Field declarations for resources and settings groups.
 * Every field must have plain-English help text in `info`; a unit test enforces it, including repeater sub-fields.
 * The generic editor draws fields from these declarations and the server validates with `buildSchema`.
 */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'richtext',
  'number',
  'money',
  'switch',
  'select',
  'segmented',
  'multiselect',
  'tags',
  'date',
  'datetime',
  'color',
  'image',
  'file',
  'gallery',
  'url',
  'email',
  'phone',
  'slug',
  'relation',
  'repeater',
  'json',
  'code',
  'icon',
  'font',
  'note',
  'password',
  /** The page builder: an ordered list of blocks. */
  'blocks',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldOption {
  value: string;
  label: string;
}

/** A condition on the record, kept serialisable so it works in the browser and on the server. */
export interface ShowIf {
  field: string;
  equals?: string | number | boolean | null;
  notEquals?: string | number | boolean | null;
  in?: readonly (string | number | boolean)[];
}

export interface FieldDef {
  /** Key in the record. Dot paths are allowed for values inside JSON columns, for example "seo.title". */
  name: string;
  label: string;
  type: FieldType;
  /** Plain-English help text shown under the field. Required. */
  info: string;
  placeholder?: string;
  required?: boolean;
  width?: 'half' | 'full';
  /** Editor tab. Defaults to "Content". */
  tab?: string;
  showIf?: ShowIf;
  /** Shown but not editable (counters, computed values). Never written by the save action. */
  readOnly?: boolean;
  /** Only administrators may see and change this field (JSON, code, custom HTML). */
  adminOnly?: boolean;
  options?: readonly FieldOption[];
  /** select / segmented: store the chosen value as a number. */
  numeric?: boolean;
  /** Options filled on the server when the editor opens, for example the list of roles. */
  optionsFrom?: 'roles' | 'staff';
  min?: number;
  max?: number;
  maxLength?: number;
  /** text: a regular expression the value must match, with the message to show. */
  pattern?: { regex: string; message: string };
  /** slug: the field the slug is made from. */
  from?: string;
  /** money: the field that holds the currency code, or a fixed code. */
  currency?: string;
  /** relation: which resource to pick from, and whether several can be picked. */
  relation?: { resource: string; multiple?: boolean };
  /** repeater: the sub-fields of each row. */
  fields?: readonly FieldDef[];
  /** code: language for the editor hint. */
  language?: 'css' | 'html' | 'json';
  /** image, file, gallery: accepted kinds. */
  accept?: 'image' | 'any';
  /** password: minimum length; the value is hashed by the resource and never shown again. */
  minLength?: number;
}

export function defineFields(fields: FieldDef[]): FieldDef[] {
  return fields;
}

/** Reads a dot path from a record. */
export function getPath(record: unknown, path: string): unknown {
  let current: unknown = record;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Writes a dot path into a copy of the record. */
export function setPath<T extends Record<string, unknown>>(record: T, path: string, value: unknown): T {
  const parts = path.split('.');
  const out: Record<string, unknown> = { ...record };
  let cursor = out;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i] as string;
    const next = cursor[key];
    cursor[key] = next && typeof next === 'object' && !Array.isArray(next) ? { ...(next as Record<string, unknown>) } : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1] as string] = value;
  return out as T;
}

export function isVisible(field: FieldDef, record: unknown): boolean {
  const rule = field.showIf;
  if (!rule) return true;
  // Compared as text so "410" from a select and 410 from the database count as equal.
  const value = String(getPath(record, rule.field) ?? '');
  const same = (v: unknown) => String(v ?? '') === value;
  if (rule.equals !== undefined && !same(rule.equals)) return false;
  if (rule.notEquals !== undefined && same(rule.notEquals)) return false;
  if (rule.in && !rule.in.some(same)) return false;
  return true;
}

/** Walks fields including repeater sub-fields. */
export function* walkFields(fields: readonly FieldDef[], prefix = ''): Generator<{ field: FieldDef; path: string }> {
  for (const field of fields) {
    yield { field, path: prefix ? `${prefix}.${field.name}` : field.name };
    if (field.type === 'repeater' && field.fields) yield* walkFields(field.fields, `${prefix ? `${prefix}.` : ''}${field.name}[]`);
  }
}
