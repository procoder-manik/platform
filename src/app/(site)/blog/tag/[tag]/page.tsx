import type { Metadata } from 'next';
import { getSetting } from '@/lib/data';
import { blogSettings } from '@/modules/blog/settings';
import { Archive } from '../../archive';

type Props = { params: Promise<{ tag: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const blog = await getSetting(blogSettings);
  const tag = decodeURIComponent((await params).tag);
  return { title: `Posts tagged “${tag}”`, robots: blog.noindexTags ? { index: false, follow: true } : undefined };
}

export default async function TagPage({ params, searchParams }: Props) {
  const raw = (await params).tag;
  const tag = decodeURIComponent(raw).slice(0, 60);
  return <Archive title={`Tagged “${tag}”`} eyebrow="Tag" query={{ tag, page: Number((await searchParams).page) || 1 }} basePath={`/blog/tag/${raw}`} />;
}
