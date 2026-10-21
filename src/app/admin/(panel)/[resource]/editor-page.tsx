import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getResource } from '@/lib/admin/registry';
import { getRecord, listRevisions, resolveFields } from '@/lib/admin/repo';
import { toClientResource } from '@/lib/admin/resource';
import { previewToken, publicPathFor } from '@/lib/admin/preview';
import { getModuleStates, isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';
import { RecordEditor } from '@/components/admin/editor/RecordEditor';
import { SEO_KINDS, siteUrl } from '@/lib/seo/context';

/** Shared by the "new" and "edit" routes. */
export async function EditorScreen({ resourceId, id, created, prefill }: { resourceId: string; id: string | null; created?: boolean; prefill?: Record<string, string> }) {
  const def = getResource(resourceId);
  if (!def || (def.readOnly && !id) || (!id && def.creatable === false)) notFound();
  const staff = await requireAreaPage(def.area);
  if (!(await isOn(def.module))) notFound();

  // New records can be prefilled from the address, for example /admin/redirects/new?from=/old-page.
  const known = new Set(def.fields.filter((f) => ['text', 'url', 'slug', 'textarea'].includes(f.type)).map((f) => f.name));
  const fromQuery = Object.fromEntries(Object.entries(prefill ?? {}).filter(([k, v]) => known.has(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 500)]));
  const record = id ? await getRecord(def, id) : { ...(def.defaults ?? {}), ...fromQuery };
  if (!record) notFound();
  const [fields, revisions, site, states] = await Promise.all([resolveFields(def.fields), id ? listRevisions(def, id) : [], getSetting(siteSettings), getModuleStates()]);
  const path = publicPathFor(def.publicPath, record);

  return (
    <RecordEditor
      key={id ?? 'new'}
      resource={toClientResource(def)}
      fields={fields}
      initial={record}
      id={id}
      revisions={revisions.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), by: r.by }))}
      liveUrl={path}
      previewUrl={def.publicPath && id ? `/preview/${def.entity}/${encodeURIComponent(id)}?token=${previewToken(def.entity, id)}` : null}
      liveModules={Object.keys(states).filter((k) => states[k])}
      seoInfo={SEO_KINDS[def.id] ? { siteName: site.siteName, siteUrl: siteUrl() } : null}
      timeZone={site.timeZone}
      isAdmin={staff.areas.includes('*')}
      flash={created ? `${def.label} created.` : undefined}
    />
  );
}
