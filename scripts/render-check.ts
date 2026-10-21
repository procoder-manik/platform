/**
 * Quality gate 4 (server render): signs in and opens every admin and public screen from the registries.
 * Fails on any status other than the expected one, or on an error page. A passing build does not prove a screen renders.
 *
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run render-check
 */
import 'dotenv/config';
import pg from 'pg';
import { RESOURCES } from '../src/lib/admin/registry';
import { SETTINGS_GROUPS } from '../src/lib/settings/registry';
import { MODULES } from '../src/modules/registry';
import { chosenStates, effectiveStates } from '../src/lib/modules/logic';
import { toMeta } from '../src/lib/modules/types';

const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const jar = new Map<string, string>();

function remember(response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const [name, ...rest] = (pair ?? '').split('=');
    if (name) jar.set(name.trim(), rest.join('='));
  }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function get(path: string) {
  const response = await fetch(base + path, { headers: { cookie: cookie() }, redirect: 'manual' });
  // Public pages are checked too; the signed-in cookie does not change them.
  remember(response);
  return { status: response.status, html: await response.text(), location: response.headers.get('location') };
}

async function signIn() {
  const csrf = await fetch(`${base}/api/auth/csrf`);
  remember(csrf);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email: process.env.ADMIN_EMAIL ?? '', password: process.env.ADMIN_PASSWORD ?? '', callbackUrl: '/admin' });
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: 'POST', body, headers: { cookie: cookie() }, redirect: 'manual' });
  remember(response);
  if (!response.headers.get('location')?.endsWith('/admin')) throw new Error('Sign-in failed. Check ADMIN_EMAIL and ADMIN_PASSWORD.');
}

async function liveModules(): Promise<Record<string, boolean>> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ data: unknown }>(`SELECT "data" FROM "Setting" WHERE "key" = 'modules'`);
    const metas = MODULES.map(toMeta);
    return effectiveStates(metas, chosenStates(metas, rows[0]?.data ?? null, { production: process.env.NODE_ENV === 'production' }));
  } finally {
    await client.end();
  }
}

async function firstIds(): Promise<Record<string, string>> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const out: Record<string, string> = {};
  try {
    for (const def of RESOURCES) {
      const table = def.model.charAt(0).toUpperCase() + def.model.slice(1);
      const where = def.id === 'users' ? `WHERE "kind" = 'STAFF'` : def.softDelete ? 'WHERE "deletedAt" IS NULL' : '';
      const { rows } = await client.query<{ id: string }>(`SELECT "id"::text AS id FROM "${table}" ${where} LIMIT 1`);
      if (rows[0]) out[def.id] = rows[0].id;
    }
  } finally {
    await client.end();
  }
  return out;
}

// Markers Next.js prints only on error pages (the 404 component itself is streamed with every page, so its text is not a marker).
const ERROR_MARKERS = ['__next_error__', 'Application error', 'Unhandled Runtime Error', 'NEXT_HTTP_ERROR_FALLBACK'];

async function main() {
  await signIn();
  const ids = await firstIds();
  const live = await liveModules();
  const screens: { path: string; expect: number }[] = [
    { path: '/admin', expect: 200 },
    { path: '/admin/modules', expect: 200 },
    { path: '/admin/media', expect: 200 },
    { path: '/admin/seo', expect: 200 },
    { path: '/admin/api-keys', expect: 200 },
    { path: '/admin/seo?filter=work', expect: 200 },
    ...SETTINGS_GROUPS.filter((g) => !g.customScreen).map((g) => ({ path: `/admin/settings/${g.key}`, expect: live[g.module] ? 200 : 404 })),
    ...RESOURCES.filter((def) => live[def.module]).flatMap((def) => [
      { path: `/admin/${def.id}`, expect: 200 },
      ...(def.softDelete ? [{ path: `/admin/${def.id}?view=trash`, expect: 200 }] : []),
      ...(def.creatable !== false && !def.readOnly ? [{ path: `/admin/${def.id}/new`, expect: 200 }] : []),
      ...(ids[def.id] ? [{ path: `/admin/${def.id}/${encodeURIComponent(ids[def.id] as string)}`, expect: 200 }] : []),
    ]),
    { path: '/', expect: 200 },
    { path: '/no-such-page', expect: 404 },
    { path: '/preview/draft', expect: 200 },
    ...(live.services ? [{ path: '/pricing', expect: 200 }] : []),
    { path: '/sitemap.xml', expect: 200 },
    { path: '/robots.txt', expect: 200 },
    { path: '/llms.txt', expect: 200 },
    { path: '/og?title=Check', expect: 200 },
    { path: '/admin/no-such-resource', expect: 404 },
  ];

  let failed = 0;
  for (const screen of screens) {
    const { status, html } = await get(screen.path);
    const marker = screen.expect === 200 ? ERROR_MARKERS.find((m) => html.includes(m)) : undefined;
    const ok = status === screen.expect && !marker;
    if (!ok) failed += 1;
    console.info(`${ok ? 'ok  ' : 'FAIL'} ${status} ${screen.path}${marker ? `  (found "${marker}")` : ''}`);
  }
  console.info(`\n${screens.length - failed} of ${screens.length} screens rendered as expected.`);
  if (failed) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
