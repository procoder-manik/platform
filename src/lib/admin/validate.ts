/**
 * Server-side validation of editor values against field declarations.
 * Returns clean, typed values keyed by dot path, or plain-English errors keyed by the same path,
 * so the editor can show each error next to its field.
 */
import { z } from 'zod';
import { getPath, isVisible, type FieldDef } from './fields';
import { SLUG_PATTERN } from './slug';
import { checkDoc } from '@/lib/richtext/render';
import { markdownToDoc } from '@/lib/richtext/markdown';

export interface ValidateOptions {
  isAdmin: boolean;
  /** Rows inside a repeater: blank text becomes an empty string (their schemas expect text), not null. */
  nested?: boolean;
  /** For partial saves (quick edit): only these paths are checked and returned. */
  only?: readonly string[];
}

export type ValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function fieldSchema(field: FieldDef): z.ZodType<unknown> {
  const max = field.maxLength;
  switch (field.type) {
    case 'richtext':
      // Tiptap JSON. Plain text (older values, imports) is converted from Markdown.
      return z.unknown().transform((v, ctx) => {
        const doc = typeof v === 'string' ? markdownToDoc(v) : v;
        const problem = checkDoc(doc);
        if (problem) {
          ctx.addIssue({ code: 'custom', message: problem });
          return z.NEVER;
        }
        return doc;
      });
    case 'text':
    case 'textarea':
    case 'code':
    case 'icon':
    case 'font': {
      let s = z.string().max(max ?? (field.type === 'text' ? 300 : 200_000), `Use ${max ?? 300} characters or fewer.`);
      if (field.pattern) s = s.regex(new RegExp(field.pattern.regex), field.pattern.message);
      return s;
    }
    case 'password':
      return z.string().min(field.minLength ?? 12, `Use at least ${field.minLength ?? 12} characters.`).max(200);
    case 'number': {
      let n = z.coerce.number({ error: 'Enter a number.' });
      if (field.min !== undefined) n = n.min(field.min, `Use ${field.min} or more.`);
      if (field.max !== undefined) n = n.max(field.max, `Use ${field.max} or less.`);
      return n;
    }
    case 'money':
      return z.coerce.number({ error: 'Enter an amount.' }).int('Amounts are stored in cents.').min(field.min ?? 0, 'The amount cannot be negative.');
    case 'switch':
      return z.boolean();
    case 'select':
    case 'segmented': {
      const values = (field.options ?? []).map((o) => o.value);
      const choice = z.coerce.string().refine((v) => values.includes(v), 'Pick one of the options.');
      return field.numeric ? choice.transform(Number) : choice;
    }
    case 'multiselect': {
      const values = (field.options ?? []).map((o) => o.value);
      return z.array(z.string().refine((v) => values.includes(v), 'Pick from the options.'));
    }
    case 'tags':
      return z.array(z.string().trim().min(1).max(60)).max(100).transform((a) => [...new Set(a)]);
    case 'date':
    case 'datetime':
      return z.coerce.date({ error: 'Enter a valid date.' });
    case 'color':
      return z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use a hex colour like #1d5bd8.');
    case 'image':
    case 'file':
    case 'url':
      return z.string().max(2000).refine((v) => /^(https?:\/\/|\/)/.test(v), 'Use a full address starting with https:// or a path starting with /.');
    case 'gallery':
      return z.array(z.string().max(2000)).max(100);
    case 'email':
      return z.email('Enter a valid email address.').max(254).transform((v) => v.toLowerCase());
    case 'phone':
      return z.string().regex(/^\+?[0-9 ()-]{6,20}$/, 'Enter a phone number with digits, spaces and an optional +.');
    case 'slug':
      return z.string().max(80).regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens.');
    case 'relation':
      return field.relation?.multiple ? z.array(z.string().max(100)) : z.string().max(100);
    case 'json':
      return z.unknown().transform((v, ctx) => {
        if (typeof v !== 'string') return v;
        try {
          return JSON.parse(v) as unknown;
        } catch {
          ctx.addIssue({ code: 'custom', message: 'This is not valid JSON.' });
          return z.NEVER;
        }
      });
    case 'repeater':
      return z.array(z.record(z.string(), z.unknown())).max(200);
    case 'note':
      return z.unknown();
    case 'blocks':
      // Checked block by block in the repository (src/lib/blocks/validate.ts).
      return z.array(z.unknown()).max(500);
  }
}

/** Blank values become null (or [] / false), so clearing a field clears it in the database. */
const TEXTLIKE = ['text', 'textarea', 'code', 'url', 'email', 'phone', 'slug', 'icon', 'font', 'color', 'password'];

function blankValue(field: FieldDef, nested = false): unknown {
  if (field.type === 'switch') return false;
  if (nested && TEXTLIKE.includes(field.type)) return '';
  if (['multiselect', 'tags', 'gallery', 'repeater', 'blocks'].includes(field.type)) return [];
  if (field.type === 'relation' && field.relation?.multiple) return [];
  return null;
}

export function validateValues(fields: readonly FieldDef[], input: Record<string, unknown>, opts: ValidateOptions): ValidationResult {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (field.type === 'note' || field.readOnly) continue;
    if (field.adminOnly && !opts.isAdmin) continue;
    if (opts.only && !opts.only.includes(field.name)) continue;
    if (!isVisible(field, input)) continue;

    const raw = getPath(input, field.name);
    if (field.type === 'password') {
      // Empty password means "keep the current one".
      if (empty(raw)) {
        if (field.required) errors[field.name] = 'Enter a password.';
        continue;
      }
    }
    // For JSON fields an empty list or object is a real value, not a blank.
    if (field.type === 'json' ? raw === undefined || raw === null || raw === '' : empty(raw)) {
      if (field.required) errors[field.name] = `${field.label} is required.`;
      else values[field.name] = blankValue(field, opts.nested);
      continue;
    }

    const parsed = fieldSchema(field).safeParse(typeof raw === 'string' && field.type !== 'password' ? raw.trim() : raw);
    // An editor holding only an empty paragraph counts as empty.
    if (parsed.success && field.type === 'richtext' && !JSON.stringify(parsed.data).includes('"text"') && !JSON.stringify(parsed.data).includes('"image"')) {
      if (field.required) errors[field.name] = `${field.label} is required.`;
      else values[field.name] = null;
      continue;
    }
    if (!parsed.success) {
      errors[field.name] = parsed.error.issues[0]?.message ?? 'This value is not valid.';
      continue;
    }

    if (field.type === 'repeater' && field.fields) {
      const rows = parsed.data as Record<string, unknown>[];
      const cleanRows: Record<string, unknown>[] = [];
      rows.forEach((row, index) => {
        const result = validateValues(field.fields ?? [], row, { isAdmin: opts.isAdmin, nested: true });
        if (result.ok) {
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(result.values)) clean[k] = v;
          cleanRows.push(clean);
        } else {
          for (const [k, msg] of Object.entries(result.errors)) errors[`${field.name}.${index}.${k}`] = msg;
        }
      });
      values[field.name] = cleanRows;
      continue;
    }

    values[field.name] = parsed.data;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}
