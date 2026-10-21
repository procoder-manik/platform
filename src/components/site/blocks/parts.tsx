/* Shared pieces for block renderers. Images use <img> so any storage host works; sizes are reserved to avoid layout shift. */
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { renderMarkdown } from '@/lib/blocks/markdown';

export interface ButtonData {
  label?: string;
  href?: string;
  variant?: 'primary' | 'ghost';
}

export function Buttons({ buttons, center }: { buttons?: ButtonData[]; center?: boolean }) {
  const list = (buttons ?? []).filter((b) => b.label && b.href).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className={`mt-8 flex flex-wrap gap-3 ${center ? 'justify-center' : ''}`}>
      {list.map((b, i) => (
        <SmartLink key={i} href={b.href as string} className={`btn ${b.variant === 'ghost' ? 'btn-ghost' : 'btn-primary'}`}>
          {b.label}
        </SmartLink>
      ))}
    </div>
  );
}

export function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function Img({ src, alt, className, eager, ratio }: { src?: string | null; alt: string; className?: string; eager?: boolean; ratio?: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      className={`${ratio ?? ''} ${className ?? ''}`}
    />
  );
}

export function Markdown({ source, className = '' }: { source?: unknown; className?: string }) {
  if (typeof source !== 'string' || !source.trim()) return null;
  return <div className={`prose-site ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}

export function SectionHeading({ heading, intro, center }: { heading?: unknown; intro?: unknown; center?: boolean }) {
  if (!heading && !intro) return null;
  return (
    <div className={`mb-10 max-w-3xl ${center ? 'mx-auto text-center' : ''}`}>
      {heading ? <h2>{String(heading)}</h2> : null}
      {intro ? <p className="mt-3 text-lg">{String(intro)}</p> : null}
    </div>
  );
}

/** Turns a YouTube or Vimeo link into a privacy-friendly embed address; null for direct video files. */
export function videoEmbed(url: string): string | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const embed = videoEmbed(url);
  return (
    <div className="aspect-video overflow-hidden rounded-card bg-raised">
      {embed ? (
        <iframe src={embed} title={title} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <video src={url} controls preload="metadata" className="h-full w-full" aria-label={title} />
      )}
    </div>
  );
}
