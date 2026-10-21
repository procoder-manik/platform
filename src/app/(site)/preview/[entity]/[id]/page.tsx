import { notFound } from 'next/navigation';
import { verifyPreviewToken } from '@/lib/admin/preview';
import { getModuleStates } from '@/lib/data';
import { getPageForPreview } from '@/lib/data/pages';
import { renderBlocks } from '@/components/site/blocks/BlockRenderer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Preview', robots: { index: false, follow: false } };

type Props = { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ token?: string }> };

/** Secret preview links for drafts. Anyone with the link can view; the token is tied to the item. */
export default async function SignedPreview({ params, searchParams }: Props) {
  const { entity, id } = await params;
  const { token } = await searchParams;
  if (entity !== 'page' || !token || !verifyPreviewToken(entity, decodeURIComponent(id), token)) notFound();
  const page = await getPageForPreview(decodeURIComponent(id));
  if (!page) notFound();
  return (
    <>
      <p className="bg-warning px-4 py-2 text-center text-sm font-medium text-base" role="status">Preview of an unpublished page. Visitors cannot see it yet.</p>
      {await renderBlocks(page.blocks, { modules: await getModuleStates() })}
    </>
  );
}
