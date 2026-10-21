/* Post, project and product cards and pagination for the content modules. */
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { PostCardData } from '@/lib/data/content';
import { ScrollShot } from '../client/Article';

export function formatDay(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone }).format(new Date(value));
}

export function PostCard({ post, timeZone, showReadingTime = true, headingLevel = 'h2' }: { post: PostCardData; timeZone: string; showReadingTime?: boolean; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      {post.cover ? <img src={post.cover} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" /> : null}
      <div className="flex flex-1 flex-col p-5">
        {post.category ? <p className="text-sm font-medium text-primary">{post.category.name}</p> : null}
        <H className="mt-1 text-h5">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 group-hover:underline">{post.title}</Link>
        </H>
        {post.excerpt ? <p className="mt-2 line-clamp-3 flex-1">{post.excerpt}</p> : <div className="flex-1" />}
        <p className="mt-4 text-sm text-muted">
          {formatDay(post.publishedAt, timeZone)}
          {showReadingTime ? `, ${post.readingMinutes} min read` : ''}
        </p>
      </div>
    </article>
  );
}

export interface ProjectCardData {
  id: string;
  title: string;
  slug: string;
  client: string | null;
  summary: string | null;
  scrollImage: string | null;
  bannerImage: string | null;
  platform: string | null;
  services: string[];
  liveUrl: string | null;
}

export function ProjectCard({ project, speed, headingLevel = 'h2' }: { project: ProjectCardData; speed: number; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel;
  const shot = project.scrollImage ?? project.bannerImage;
  return (
    <article className="flex h-full flex-col">
      {shot ? <ScrollShot src={shot} alt={`Screenshot of ${project.title}`} speed={speed} href={project.liveUrl} /> : <div className="aspect-[16/10] rounded-card bg-raised" />}
      <div className="mt-4">
        <p className="text-sm text-muted">{[project.platform, ...project.services.slice(0, 2)].filter(Boolean).join(' · ')}</p>
        <H className="mt-1 text-h5"><Link href={`/portfolio/${project.slug}`} className="hover:underline">{project.title}</Link></H>
        {project.summary ? <p className="mt-1">{project.summary}</p> : null}
      </div>
    </article>
  );
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-12 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? <Link className="btn btn-ghost" href={href(page - 1)} rel="prev">Newer</Link> : null}
      <span className="px-3 text-sm text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link className="btn btn-ghost" href={href(page + 1)} rel="next">Older</Link> : null}
    </nav>
  );
}

export function PageIntro({ title, intro, eyebrow }: { title: string; intro?: string | null; eyebrow?: string }) {
  return (
    <header className="mx-auto max-w-shell px-5 pb-10 pt-16 sm:px-6 md:pt-24">
      {eyebrow ? <p className="text-sm font-medium text-primary">{eyebrow}</p> : null}
      <h1 className="mt-1">{title}</h1>
      {intro ? <p className="mt-4 max-w-2xl text-lg">{intro}</p> : null}
    </header>
  );
}
