import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategory } from '@/lib/data/content';
import { Archive } from '../../archive';
import { seoMetadata } from '@/lib/seo/meta';
import { SeoHead } from '@/components/site/SeoHead';
import { getSetting } from '@/lib/settings/store';
import { seoSettings } from '@/lib/seo/settings';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategory((await params).slug);
  if (!category) return {};
  const site = await getSetting(seoSettings);
  return seoMetadata({ title: category.name, description: category.description, path: `/blog/category/${category.slug}`, seo: category.seo as Record<string, unknown>, noindexDefault: !site.indexCategories });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  return (
    <>
      <SeoHead resourceId="categories" record={category as unknown as Record<string, unknown>} />
      <Archive title={category.name} intro={category.description} eyebrow="Category" query={{ categoryId: category.id, page: Number((await searchParams).page) || 1 }} basePath={`/blog/category/${slug}`} />
    </>
  );
}
