import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuthor } from '@/lib/data/content';
import { Archive } from '../../archive';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const author = await getAuthor((await params).id);
  return author ? { title: `Posts by ${author.name ?? 'our team'}`, description: author.bio ?? undefined } : {};
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { id } = await params;
  const author = await getAuthor(id);
  if (!author) notFound();
  return <Archive title={author.name ?? 'Our team'} intro={author.bio} eyebrow="Author" query={{ authorId: author.id, page: Number((await searchParams).page) || 1 }} basePath={`/blog/author/${id}`} />;
}
