/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModuleStates, getSetting } from '@/lib/data';
import { getPost, getPostNeighbours, listPosts } from '@/lib/data/content';
import { renderRichText } from '@/lib/richtext/render';
import { blogSettings } from '@/modules/blog/settings';
import { siteSettings } from '@/modules/core/settings';
import type { Block } from '@/lib/blocks/types';
import { renderBlocks } from '@/components/site/blocks/BlockRenderer';
import { CopyLink, ReadingProgress, TableOfContents } from '@/components/site/client/Article';
import { PostCard, formatDay } from '@/components/site/content/Cards';
import { seoMetadata } from '@/lib/seo/meta';
import { SeoHead } from '@/components/site/SeoHead';

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() {
  const { posts } = await listPosts({ perPage: 20 });
  return posts.map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  return seoMetadata({ title: post.title, description: post.excerpt, path: `/blog/${post.slug}`, image: post.cover, seo: post.seo as Record<string, unknown>, type: 'article', publishedTime: post.publishedAt ? new Date(post.publishedAt).toISOString() : null });
}

export default async function PostPage({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const [blog, site, states, near] = await Promise.all([getSetting(blogSettings), getSetting(siteSettings), getModuleStates(), getPostNeighbours(post)]);
  const rendered = renderRichText(post.body);
  const showToc = post.kind === 'article' && rendered.headings.length >= 2;
  const url = `${(process.env.SITE_URL ?? '').replace(/\/$/, '')}/blog/${post.slug}`;
  const share = [
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: 'X', href: `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}` },
  ];

  return (
    <article id="article">
      <SeoHead resourceId="posts" record={post as unknown as Record<string, unknown>} />
      {blog.showProgress ? <ReadingProgress targetId="article-body" /> : null}
      <header className="mx-auto max-w-3xl px-5 pb-8 pt-14 sm:px-6 md:pt-20">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <ol className="flex flex-wrap gap-1">
            <li><Link href="/blog" className="hover:underline">{blog.title}</Link></li>
            {post.category ? <li>/ <Link href={`/blog/category/${post.category.slug}`} className="hover:underline">{post.category.name}</Link></li> : null}
          </ol>
        </nav>
        <h1 className="mt-3">{post.title}</h1>
        {post.excerpt ? <p className="mt-4 text-lg">{post.excerpt}</p> : null}
        <p className="mt-5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          {blog.showAuthor && post.author ? (
            <Link href={`/blog/author/${post.author.id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:underline">
              {post.author.avatar ? <img src={post.author.avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : null}
              {post.author.name}
            </Link>
          ) : null}
          <time dateTime={post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined}>{formatDay(post.publishedAt, site.timeZone)}</time>
          {blog.showReadingTime ? <span>· {post.readingMinutes} min read</span> : null}
        </p>
      </header>
      {post.cover ? <img src={post.cover} alt="" className="mx-auto mb-10 aspect-[16/9] w-full max-w-5xl object-cover sm:rounded-card" fetchPriority="high" /> : null}

      <div className={`mx-auto px-5 sm:px-6 ${showToc ? 'max-w-6xl lg:grid lg:grid-cols-[1fr_15rem] lg:gap-12' : 'max-w-3xl'}`}>
        <div id="article-body" className="min-w-0">
          {showToc ? <div className="lg:hidden"><TableOfContents headings={rendered.headings} /></div> : null}
          <div className="prose-site max-w-none text-lg" dangerouslySetInnerHTML={{ __html: post.bodyHtml ?? rendered.html }} />
          {post.tags.length ? (
            <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tags">
              {post.tags.map((tag) => <li key={tag}><Link href={`/blog/tag/${encodeURIComponent(tag)}`} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm hover:bg-raised">#{tag}</Link></li>)}
            </ul>
          ) : null}
          {blog.showShare ? (
            <div className="mt-8 flex flex-wrap items-center gap-2" data-print="hide">
              <span className="text-sm text-muted">Share:</span>
              {share.map((s) => <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink hover:bg-raised">{s.label}</a>)}
              <CopyLink url={url} />
            </div>
          ) : null}
          {blog.showAuthor && post.author?.bio ? (
            <aside className="mt-12 flex gap-4 rounded-card border border-line bg-surface p-5" aria-label="About the author">
              {post.author.avatar ? <img src={post.author.avatar} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" /> : null}
              <div>
                <p className="font-semibold text-ink">{post.author.name}</p>
                <p className="mt-1 text-sm">{post.author.bio}</p>
              </div>
            </aside>
          ) : null}
        </div>
        {showToc ? <aside className="hidden lg:block"><div className="sticky top-24"><TableOfContents headings={rendered.headings} /></div></aside> : null}
      </div>

      {Array.isArray(post.afterBlocks) && post.afterBlocks.length ? <div className="mt-16">{await renderBlocks(post.afterBlocks as unknown as Block[], { modules: states })}</div> : null}

      <footer className="mx-auto mt-16 max-w-shell px-5 pb-24 sm:px-6" data-print="hide">
        {near.previous || near.next ? (
          <nav aria-label="More posts" className="grid gap-4 border-y border-line py-6 sm:grid-cols-2">
            {near.previous ? <Link href={`/blog/${near.previous.slug}`} rel="prev" className="block"><span className="text-sm text-muted">Previous</span><span className="block font-semibold text-ink hover:underline">{near.previous.title}</span></Link> : <span />}
            {near.next ? <Link href={`/blog/${near.next.slug}`} rel="next" className="block sm:text-right"><span className="text-sm text-muted">Next</span><span className="block font-semibold text-ink hover:underline">{near.next.title}</span></Link> : null}
          </nav>
        ) : null}
        {blog.showRelated && near.related.length ? (
          <section aria-labelledby="related" className="mt-12">
            <h2 id="related" className="text-h3">Related posts</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {near.related.map((p) => <PostCard key={p.id} post={p} timeZone={site.timeZone} showReadingTime={blog.showReadingTime} headingLevel="h3" />)}
            </div>
          </section>
        ) : null}
      </footer>
    </article>
  );
}
