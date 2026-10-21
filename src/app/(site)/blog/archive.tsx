import { getSetting } from '@/lib/data';
import { listPosts, type PostQuery } from '@/lib/data/content';
import { blogSettings } from '@/modules/blog/settings';
import { siteSettings } from '@/modules/core/settings';
import { Pagination, PageIntro, PostCard } from '@/components/site/content/Cards';

/** Shared archive used by the blog, category, tag and author pages. */
export async function Archive({ title, intro, eyebrow, query, basePath, search }: { title: string; intro?: string | null; eyebrow?: string; query: PostQuery; basePath: string; search?: boolean }) {
  const [blog, site] = await Promise.all([getSetting(blogSettings), getSetting(siteSettings)]);
  const page = Math.max(1, query.page ?? 1);
  const { posts, total } = await listPosts({ ...query, page, perPage: blog.perPage });
  const pages = Math.max(1, Math.ceil(total / blog.perPage));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <>
      <PageIntro title={title} intro={intro} eyebrow={eyebrow} />
      <div className="mx-auto max-w-shell px-5 pb-24 sm:px-6">
        {search ? (
          <form role="search" method="get" action={basePath} className="mb-10 flex max-w-xl gap-2">
            <label htmlFor="blog-q" className="sr-only">Search the blog</label>
            <input id="blog-q" name="q" defaultValue={query.q} placeholder="Search articles" className="min-h-11 flex-1 rounded-input border border-line bg-surface px-3 text-ink" />
            <button type="submit" className="btn btn-primary">Search</button>
          </form>
        ) : null}
        {query.q ? <p className="mb-6 text-muted" role="status">{total} {total === 1 ? 'result' : 'results'} for “{query.q}”.</p> : null}
        {posts.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-8 text-center">{query.q ? 'Nothing matches that search. Try other words.' : 'No posts here yet.'}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => <PostCard key={post.id} post={post} timeZone={site.timeZone} showReadingTime={blog.showReadingTime} />)}
          </div>
        )}
        <Pagination page={page} pages={pages} href={href} />
      </div>
    </>
  );
}
