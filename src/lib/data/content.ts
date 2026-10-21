import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';

/** Public readers for the content modules. Cached with tags; failures fall back to empty results. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('[data] content read failed, using fallback', error);
    return fallback;
  }
}
const cached = <T>(key: string[], tags: string[], fn: () => Promise<T>) => unstable_cache(fn, key, { tags: [TAGS.content, ...tags], revalidate: 3600 })();

const livePost = () => ({ deletedAt: null, OR: [{ status: 'PUBLISHED' as const }, { status: 'SCHEDULED' as const, publishAt: { lte: new Date() } }] });
const postCard = { id: true, title: true, slug: true, excerpt: true, cover: true, kind: true, tags: true, featured: true, readingMinutes: true, publishedAt: true, updatedAt: true, category: { select: { name: true, slug: true, color: true } }, author: { select: { id: true, name: true, avatar: true } } } as const;

export type PostCardData = {
  id: string; title: string; slug: string; excerpt: string | null; cover: string | null; kind: string; tags: string[]; featured: boolean; readingMinutes: number;
  publishedAt: Date | string | null; updatedAt: Date | string;
  category: { name: string; slug: string; color: string | null } | null; author: { id: string; name: string | null; avatar: string | null } | null;
};

export interface PostQuery {
  page?: number;
  perPage?: number;
  categoryId?: string;
  tag?: string;
  authorId?: string;
  q?: string;
  featuredFirst?: boolean;
}

export function listPosts(query: PostQuery): Promise<{ posts: PostCardData[]; total: number }> {
  const perPage = query.perPage ?? 12;
  const page = Math.max(1, query.page ?? 1);
  const run = async () => {
    const where = {
      ...livePost(),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.q ? { AND: [{ OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }, { excerpt: { contains: query.q, mode: 'insensitive' as const } }, { bodyHtml: { contains: query.q, mode: 'insensitive' as const } }] }] } : {}),
    };
    const db = getDb();
    const [posts, total] = await Promise.all([
      db.post.findMany({ where, select: postCard, orderBy: query.featuredFirst ? [{ featured: 'desc' }, { publishedAt: 'desc' }] : [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * perPage, take: perPage }),
      db.post.count({ where }),
    ]);
    return { posts, total };
  };
  // Searches are not cached; listings are.
  if (query.q) return safe(run, { posts: [], total: 0 });
  return safe(() => cached(['posts', JSON.stringify(query)], [TAGS.type('post')], run), { posts: [], total: 0 });
}

export function getPost(slug: string) {
  return safe(
    () =>
      cached(['post', slug], [TAGS.type('post'), TAGS.slug(slug)], () =>
        getDb().post.findFirst({
          where: { slug, ...livePost() },
          include: { category: { select: { id: true, name: true, slug: true, color: true } }, author: { select: { id: true, name: true, avatar: true, bio: true } } },
        }),
      ),
    null,
  );
}

export function getPostNeighbours(post: { id: string; publishedAt: Date | string | null; categoryId: string | null; tags: string[] }) {
  return safe(
    () =>
      cached(['post-neighbours', post.id], [TAGS.type('post')], async () => {
        const db = getDb();
        const at = post.publishedAt ? new Date(post.publishedAt) : new Date();
        const [previous, next, related] = await Promise.all([
          db.post.findFirst({ where: { ...livePost(), publishedAt: { lt: at }, NOT: { id: post.id } }, orderBy: { publishedAt: 'desc' }, select: { title: true, slug: true } }),
          db.post.findFirst({ where: { ...livePost(), publishedAt: { gt: at }, NOT: { id: post.id } }, orderBy: { publishedAt: 'asc' }, select: { title: true, slug: true } }),
          db.post.findMany({
            where: { ...livePost(), NOT: { id: post.id }, OR: [...(post.categoryId ? [{ categoryId: post.categoryId }] : []), ...(post.tags.length ? [{ tags: { hasSome: post.tags } }] : [])] },
            orderBy: { publishedAt: 'desc' },
            take: 3,
            select: postCard,
          }),
        ]);
        return { previous, next, related: post.categoryId || post.tags.length ? related : [] };
      }),
    { previous: null, next: null, related: [] },
  );
}

export function getCategory(slug: string) {
  return safe(() => cached(['category', slug], [TAGS.type('category')], () => getDb().category.findUnique({ where: { slug } })), null);
}

export function listCategories() {
  return safe(() => cached(['categories'], [TAGS.type('category')], () => getDb().category.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true } })), []);
}

export function getAuthor(id: string) {
  return safe(() => cached(['author', id], [TAGS.type('user'), TAGS.type('post')], () => getDb().user.findFirst({ where: { id, kind: 'STAFF', posts: { some: livePost() } }, select: { id: true, name: true, avatar: true, bio: true } })), null);
}

/** Every live post, newest first, for the RSS feed (and the sitemap in Phase 4). */
export function feedPosts(limit = 50) {
  return safe(
    () => cached(['feed', String(limit)], [TAGS.type('post')], () => getDb().post.findMany({ where: livePost(), orderBy: { publishedAt: 'desc' }, take: limit, select: { title: true, slug: true, excerpt: true, bodyHtml: true, publishedAt: true, updatedAt: true, category: { select: { name: true } }, author: { select: { name: true } } } })),
    [],
  );
}

// ---------- portfolio ----------

const liveProject = { deletedAt: null, status: 'PUBLISHED' as const };
const projectCard = { id: true, title: true, slug: true, client: true, summary: true, scrollImage: true, bannerImage: true, platform: true, services: true, accent: true, featured: true, liveUrl: true } as const;

export function listProjects(filter: { platform?: string; service?: string; featured?: boolean; limit?: number } = {}) {
  return safe(
    () =>
      cached(['projects', JSON.stringify(filter)], [TAGS.type('project')], () =>
        getDb().project.findMany({
          where: { ...liveProject, ...(filter.platform ? { platform: filter.platform } : {}), ...(filter.service ? { services: { has: filter.service } } : {}), ...(filter.featured ? { featured: true } : {}) },
          orderBy: [{ featured: 'desc' }, { order: 'asc' }, { createdAt: 'desc' }],
          take: filter.limit ?? 100,
          select: projectCard,
        }),
      ),
    [],
  );
}

export function projectFacets() {
  return safe(
    () =>
      cached(['project-facets'], [TAGS.type('project')], async () => {
        const rows = await getDb().project.findMany({ where: liveProject, select: { platform: true, services: true } });
        return {
          platforms: [...new Set(rows.map((r) => r.platform).filter(Boolean) as string[])].sort(),
          services: [...new Set(rows.flatMap((r) => r.services))].sort(),
        };
      }),
    { platforms: [], services: [] },
  );
}

export function getProject(slug: string) {
  return safe(() => cached(['project', slug], [TAGS.type('project'), TAGS.slug(slug)], () => getDb().project.findFirst({ where: { slug, ...liveProject }, include: { caseStudies: { where: { status: 'PUBLISHED', deletedAt: null }, select: { title: true, slug: true } } } })), null);
}

// ---------- case studies ----------

export function listCaseStudies(limit = 50) {
  return safe(() => cached(['case-studies', String(limit)], [TAGS.type('caseStudy')], () => getDb().caseStudy.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: limit, select: { id: true, title: true, slug: true, client: true, summary: true, cover: true, metrics: true } })), []);
}

export function getCaseStudy(slug: string) {
  return safe(() => cached(['case-study', slug], [TAGS.type('caseStudy'), TAGS.slug(slug)], () => getDb().caseStudy.findFirst({ where: { slug, status: 'PUBLISHED', deletedAt: null }, include: { project: { select: { title: true, slug: true, status: true, deletedAt: true } } } })), null);
}

// ---------- products showcase ----------

export function listApps(opts: { footer?: boolean } = {}) {
  return safe(() => cached(['apps', String(opts.footer)], [TAGS.type('appProduct')], () => getDb().appProduct.findMany({ where: { status: 'PUBLISHED', ...(opts.footer ? { inFooter: true } : {}) }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, tagline: true, logo: true, url: true } })), []);
}

export function getApp(slug: string) {
  return safe(() => cached(['app', slug], [TAGS.type('appProduct'), TAGS.slug(slug)], () => getDb().appProduct.findFirst({ where: { slug, status: 'PUBLISHED' } })), null);
}

// ---------- testimonials ----------

export function listTestimonials(limit = 12) {
  return safe(() => cached(['testimonials', String(limit)], [TAGS.type('testimonial')], () => getDb().testimonial.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { createdAt: 'desc' }], take: limit })), []);
}
