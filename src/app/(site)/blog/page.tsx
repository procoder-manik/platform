import type { Metadata } from 'next';
import { getSetting } from '@/lib/data';
import { blogSettings } from '@/modules/blog/settings';
import { Archive } from './archive';
import { SeoHead, collectionContext } from '@/components/site/SeoHead';

type Props = { searchParams: Promise<{ page?: string; q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const blog = await getSetting(blogSettings);
  const { page, q } = await searchParams;
  return { title: Number(page) > 1 ? `${blog.title}, page ${page}` : blog.title, description: blog.intro || undefined, robots: q ? { index: false } : undefined, alternates: { canonical: '/blog' } };
}

export default async function BlogPage({ searchParams }: Props) {
  const blog = await getSetting(blogSettings);
  const { page, q } = await searchParams;
  return (
    <>
      <SeoHead page={collectionContext('/blog', blog.title, blog.intro || null, [{ name: blog.title, path: '/blog' }])} />
      <Archive title={blog.title} intro={blog.intro} query={{ page: Number(page) || 1, q: q?.slice(0, 100) }} basePath="/blog" search />
    </>
  );
}
