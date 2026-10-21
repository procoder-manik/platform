/**
 * Validates page blocks on save: known types only, props checked against each block's fields,
 * style values limited to tokens, containers one level deep, admin-only blocks kept only for administrators.
 * Errors are keyed "blocks.<index>.<field>" so the builder can point at the block.
 */
import { validateValues } from '@/lib/admin/validate';
import { STYLE_FIELDS } from './style-fields';
import { getBlockDef } from './catalog';
import { newBlockId, type Block, type BlockStyle } from './types';

export const MAX_BLOCKS = 200;

export type BlocksResult = { ok: true; blocks: Block[] } | { ok: false; errors: Record<string, string> };

/** Keeps each valid style value and silently drops the rest, so one bad value never loses the others. */
function cleanStyle(raw: unknown): BlockStyle {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const style: Record<string, unknown> = {};
  for (const field of STYLE_FIELDS) {
    const result = validateValues([field], input, { isAdmin: true });
    const v = result.ok ? result.values[field.name] : undefined;
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) style[field.name] = v;
  }
  return style as BlockStyle;
}

export function validateBlocks(input: unknown, opts: { isAdmin: boolean; existing?: Block[]; prefix?: string; depth?: number }): BlocksResult {
  const prefix = opts.prefix ?? 'blocks';
  if (!Array.isArray(input)) return { ok: false, errors: { [prefix]: 'Sections must be a list.' } };
  if (input.length > MAX_BLOCKS) return { ok: false, errors: { [prefix]: `Use ${MAX_BLOCKS} sections or fewer.` } };
  const errors: Record<string, string> = {};
  const blocks: Block[] = [];
  const seen = new Set<string>();

  input.forEach((raw, index) => {
    const at = `${prefix}.${index}`;
    if (!raw || typeof raw !== 'object') {
      errors[at] = 'This section is not valid.';
      return;
    }
    const item = raw as Record<string, unknown>;
    const def = getBlockDef(String(item.type));
    if (!def) {
      errors[at] = `Unknown section type "${String(item.type)}".`;
      return;
    }
    let id = typeof item.id === 'string' && /^blk_[a-z0-9]{4,24}$/.test(item.id) ? item.id : newBlockId();
    if (seen.has(id)) id = newBlockId();
    seen.add(id);

    // Non-administrators cannot add, change or remove admin-only blocks: keep the stored version.
    if (def.adminOnly && !opts.isAdmin) {
      const kept = opts.existing?.find((b) => b.id === id && b.type === def.type);
      if (kept) blocks.push(kept);
      return;
    }

    const props = (item.props && typeof item.props === 'object' ? item.props : {}) as Record<string, unknown>;
    const result = validateValues(def.fields, { ...def.defaults, ...props }, { isAdmin: opts.isAdmin });
    if (!result.ok) {
      for (const [k, msg] of Object.entries(result.errors)) errors[`${at}.${k}`] = `${def.label}: ${msg}`;
      return;
    }
    // Keep admin-only props as stored when a non-administrator saves.
    const kept = opts.existing?.find((b) => b.id === id);
    const values = { ...result.values };
    if (!opts.isAdmin) for (const f of def.fields) if (f.adminOnly && kept?.props[f.name] !== undefined) values[f.name] = kept.props[f.name];

    const block: Block = { id, type: def.type, props: values, style: cleanStyle(item.style), hidden: item.hidden === true };
    if (def.container) {
      if ((opts.depth ?? 0) >= 1) {
        errors[at] = 'Containers cannot hold other containers.';
        return;
      }
      const children = validateBlocks(Array.isArray(item.children) ? item.children : [], { ...opts, prefix: `${at}.children`, depth: 1, existing: kept?.children });
      if (!children.ok) Object.assign(errors, children.errors);
      else {
        const nested = children.blocks.filter((c) => getBlockDef(c.type)?.container);
        if (nested.length) errors[`${at}.children`] = 'Containers cannot hold other containers.';
        block.children = children.blocks;
      }
    }
    blocks.push(block);
  });

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, blocks };
}
