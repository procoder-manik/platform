import { getResource } from '@/lib/admin/registry';
import { buildSchema, graphJson, type PageContext } from '@/lib/seo/schema';
import { getSiteContext, pageContextFor } from '@/lib/seo/context';
import { scopedCss } from '@/lib/blocks/sanitize';

/**
 * Prints the page's JSON-LD graph and its page-only CSS. Pass a record of an SEO-capable resource,
 * or a ready page context for archives and built-in pages.
 */
export async function SeoHead({ resourceId, record, page }: { resourceId?: string; record?: Record<string, unknown>; page?: PageContext }) {
  const def = resourceId ? getResource(resourceId) : undefined;
  const context = page ?? (def && record ? await pageContextFor(def, record) : null);
  if (!context) return null;
  const site = await getSiteContext();
  const seo = context.seo ?? {};
  const nodes = seo.schemaType === 'none' ? buildSchema(site, { ...context, faq: [], seo: {} }).slice(0, 2) : buildSchema(site, context);
  const css = typeof seo.css === 'string' && seo.css.trim() ? scopedCss('main', seo.css).replace(/^#main/, 'main#main') : '';
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graphJson(nodes) }} />
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
    </>
  );
}

/** Context for archives and built-in pages that have no record. */
export function collectionContext(path: string, title: string, description: string | null, crumbs: { name: string; path: string }[], faq: PageContext['faq'] = []): PageContext {
  return { kind: 'collection', path, title, description, image: null, breadcrumbs: [{ name: 'Home', path: '/' }, ...crumbs], faq, seo: {} };
}
