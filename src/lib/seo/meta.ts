import type { Metadata } from 'next';

/** Builds Next.js metadata from a record's SEO values with sensible fallbacks. */
export function seoMetadata(input: { title: string; description?: string | null; path: string; image?: string | null; seo?: Record<string, unknown> | null; type?: 'website' | 'article'; publishedTime?: string | null; noindexDefault?: boolean }): Metadata {
  const seo = (input.seo ?? {}) as Record<string, unknown>;
  const title = String(seo.title || input.title);
  const description = String(seo.description || input.description || '') || undefined;
  const noindex = seo.noindex === true || input.noindexDefault === true;
  const nofollow = seo.nofollow === true;
  const maxSnippet = typeof seo.maxSnippet === 'number' ? seo.maxSnippet : -1;
  const image = String(seo.ogImage || input.image || '') || `/og?title=${encodeURIComponent(String(seo.ogTitle || input.title)).slice(0, 300)}`;
  return {
    title,
    description,
    alternates: { canonical: String(seo.canonical || input.path) },
    robots: { index: !noindex, follow: !nofollow, 'max-snippet': maxSnippet, 'max-image-preview': (['large', 'standard', 'none'].includes(String(seo.maxImagePreview)) ? seo.maxImagePreview : 'large') as 'large' },
    openGraph: { type: input.type ?? 'website', title: String(seo.ogTitle || title), description: String(seo.ogDescription || description || '') || undefined, url: input.path, images: [{ url: image, width: 1200, height: 630 }], publishedTime: input.publishedTime ?? undefined },
    twitter: { card: seo.twitterCard === 'summary' ? 'summary' : 'summary_large_image', title: String(seo.ogTitle || title), description: String(seo.ogDescription || description || '') || undefined, images: [image] },
  };
}
