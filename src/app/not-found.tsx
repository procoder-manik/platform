import Link from 'next/link';
import { LogMissing } from '@/components/site/client/LogMissing';
import { SiteFrame } from '@/components/site/SiteFrame';
import { renderBlocks } from '@/components/site/blocks/BlockRenderer';
import { getModuleStates } from '@/lib/data';
import { getPageBySlug } from '@/lib/data/pages';

export const metadata = { title: 'Page not found', robots: { index: false } };

/**
 * The 404 page. Publish a page with the address "not-found" to design it in the builder;
 * otherwise this default is shown. The missing address is logged for the redirect tool from the browser, so this page can stay static.
 */
export default async function NotFound() {
  const custom = await getPageBySlug('not-found');
  const states = await getModuleStates();
  return (
    <SiteFrame>
      <LogMissing />
      {custom ? (
        await renderBlocks(custom.blocks, { modules: states })
      ) : (
        <section className="mx-auto max-w-shell px-5 py-24 sm:px-6">
          <p className="text-sm font-medium text-muted">Error 404</p>
          <h1 className="mt-2">This page is not here</h1>
          <p className="mt-4 max-w-prose text-lg">The address may be mistyped, or the page has moved. Try the home page instead.</p>
          <p className="mt-8">
            <Link href="/" className="btn btn-primary">Go to the home page</Link>
          </p>
        </section>
      )}
    </SiteFrame>
  );
}
