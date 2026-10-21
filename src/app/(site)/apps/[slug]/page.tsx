/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seoMetadata } from '@/lib/seo/meta';
import { SeoHead } from '@/components/site/SeoHead';
import { getSetting } from '@/lib/data';
import { getApp } from '@/lib/data/content';
import { appsSettings } from '@/modules/productsShowcase/settings';

export const revalidate = 3600;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getApp((await params).slug);
  if (!a) return {};
  return seoMetadata({ title: a.name, description: a.tagline, path: `/apps/${a.slug}`, image: a.logo, seo: a.seo as Record<string, unknown> });
}

export default async function AppPage({ params }: Props) {
  const a = await getApp((await params).slug);
  if (!a) notFound();
  const s = await getSetting(appsSettings);
  return (
    <article className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-6 md:pt-24">
      <SeoHead resourceId="apps" record={a as unknown as Record<string, unknown>} />
      <Link href="/apps" className="text-sm text-muted hover:underline">{s.title}</Link>
      <div className="mt-3 flex items-center gap-4">
        {a.logo ? <img src={a.logo} alt="" className="h-16 w-16 rounded-input object-contain" /> : null}
        <h1>{a.name}</h1>
      </div>
      {a.tagline ? <p className="mt-4 text-lg">{a.tagline}</p> : null}
      {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-6">Visit {a.name}</a> : null}
      {a.bodyHtml ? <div className="prose-site mt-10 max-w-none text-lg" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} /> : null}
    </article>
  );
}
