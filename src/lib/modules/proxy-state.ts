/**
 * Module states for the proxy. The proxy is bundled apart from the app, so it cannot share the
 * Next data cache. It keeps a short in-memory copy instead (MODULE_PROXY_TTL_MS, default 3 seconds).
 * Route handlers and server actions check requireModule() as well, so a stale copy never exposes data.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { poolMax } from '@/lib/db-pool';
import { MODULES } from '@/modules/registry';
import { chosenStates, effectiveStates, type ModuleStates } from './logic';
import { toMeta } from './types';

const metas = MODULES.map(toMeta);
const ttl = Number(process.env.MODULE_PROXY_TTL_MS ?? 3000);
let memo: { at: number; states: ModuleStates } | null = null;
let client: PrismaClient | null = null;

function db(): PrismaClient | null {
  if (!process.env.DATABASE_URL) return null;
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: poolMax() }) });
  return client;
}

export function proxyModuleMetas() {
  return metas;
}

export async function proxyModuleStates(): Promise<ModuleStates> {
  const now = Date.now();
  if (memo && now - memo.at < ttl) return memo.states;
  const production = process.env.NODE_ENV === 'production';
  let saved: unknown = null;
  try {
    const row = await db()?.setting.findUnique({ where: { key: 'modules' } });
    saved = row?.data ?? null;
  } catch (error) {
    console.error('[proxy] Could not read module switches, using defaults.', error);
  }
  const states = effectiveStates(metas, chosenStates(metas, saved, { production }));
  memo = { at: now, states };
  return states;
}

export interface ProxyRedirect {
  id: string;
  from: string;
  to: string;
  code: number;
  match: string;
}
let redirectMemo: { at: number; list: ProxyRedirect[] } | null = null;

/** Active redirects, kept in memory as briefly as module switches. */
export async function proxyRedirects(): Promise<ProxyRedirect[]> {
  const now = Date.now();
  if (redirectMemo && now - redirectMemo.at < ttl) return redirectMemo.list;
  let list: ProxyRedirect[] = redirectMemo?.list ?? [];
  try {
    list = (await db()?.redirect.findMany({ where: { active: true }, select: { id: true, from: true, to: true, code: true, match: true } })) ?? [];
  } catch (error) {
    console.error('[proxy] Could not read redirects.', error);
  }
  redirectMemo = { at: now, list };
  return list;
}

/** Finds the redirect for a path: exact first, then the longest prefix, then patterns. */
export function matchRedirect(list: ProxyRedirect[], path: string): { redirect: ProxyRedirect; to: string } | null {
  const exact = list.find((r) => r.match === 'exact' && r.from === path);
  if (exact) return { redirect: exact, to: exact.to };
  const prefix = list
    .filter((r) => r.match === 'prefix' && (path === r.from || path.startsWith(r.from.endsWith('/') ? r.from : `${r.from}/`)))
    .sort((a, b) => b.from.length - a.from.length)[0];
  if (prefix) return { redirect: prefix, to: prefix.code === 410 ? '' : `${prefix.to.replace(/\/$/, '')}${path.slice(prefix.from.replace(/\/$/, '').length)}` };
  for (const r of list.filter((x) => x.match === 'regex')) {
    try {
      const re = new RegExp(r.from);
      if (re.test(path)) return { redirect: r, to: path.replace(re, r.to) };
    } catch {
      /* invalid patterns are refused on save */
    }
  }
  return null;
}

export function countRedirectHit(id: string): void {
  void db()?.redirect.update({ where: { id }, data: { hits: { increment: 1 } } }).catch(() => undefined);
}
