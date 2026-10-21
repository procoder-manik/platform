/**
 * The SEO score: a checklist graded against the focus keyword. Advice only; it never blocks publishing.
 * Pure, so the same function scores on save, in the editor panel, in lists and in the overview.
 */
import type { Extracted } from './extract';

export type SeoGroup = 'Keyword' | 'Content' | 'Media and links' | 'Technical';

export interface SeoCheck {
  id: string;
  group: SeoGroup;
  label: string;
  pass: boolean;
  weight: number;
  tip: string;
}

export interface SeoInput {
  /** Content type, for the length target. */
  kind: 'page' | 'post' | 'project' | 'caseStudy' | 'app' | 'category';
  title: string;
  slug: string;
  seo: Record<string, unknown>;
  content: Extracted;
  /** Titles of other records that already use the same focus keyword. */
  keywordUsedBy: string[];
  /** Address of this site, to tell internal links from external ones. */
  siteHost: string;
  hasSchema: boolean;
}

export interface SeoResult {
  score: number;
  checks: SeoCheck[];
  fixes: string[];
}

const MIN_WORDS: Record<SeoInput['kind'], number> = { page: 300, post: 600, project: 200, caseStudy: 500, app: 200, category: 40 };
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function scoreTone(score: number): 'good' | 'ok' | 'poor' {
  return score >= 80 ? 'good' : score >= 60 ? 'ok' : 'poor';
}

export function scoreSeo(input: SeoInput): SeoResult {
  const seo = input.seo;
  const keyword = norm(String(seo.focusKeyword ?? ''));
  const metaTitle = String(seo.title || input.title || '');
  const description = String(seo.description ?? '');
  const text = norm(input.content.text);
  const words = input.content.words;
  const has = (haystack: string) => Boolean(keyword) && norm(haystack).includes(keyword);
  const occurrences = keyword ? (` ${text} `.match(new RegExp(` ${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'g')) ?? []).length : 0;
  const density = words ? ((occurrences * keyword.split(' ').length) / words) * 100 : 0;
  const first100 = text.split(' ').slice(0, 100).join(' ');
  const h2s = input.content.headings.filter((h) => h.level === 2);
  const images = input.content.images;
  const internal = input.content.links.filter((l) => l.startsWith('/') || l.startsWith('#') || (input.siteHost && l.includes(input.siteHost)));
  const external = input.content.links.filter((l) => /^https?:\/\//.test(l) && !(input.siteHost && l.includes(input.siteHost)));
  const levels = input.content.headings.map((h) => h.level);
  const ordered = levels.every((l, i) => i === 0 || l <= (levels[i - 1] as number) + 1);
  const sentences = input.content.text.split(/[.!?।]+\s/).filter((s) => s.trim().split(/\s+/).length > 2);
  const avgSentence = sentences.length ? sentences.reduce((n, s) => n + s.trim().split(/\s+/).length, 0) / sentences.length : 0;
  const longParagraphs = input.content.paragraphs.filter((p) => p.split(/\s+/).length > 150).length;
  const noKeyword = 'Add a focus keyword in the SEO tab first.';
  const canonical = String(seo.canonical ?? '');
  const noindex = seo.noindex === true;
  const excluded = seo.sitemap === 'exclude';

  const checks: SeoCheck[] = [
    { id: 'kw-set', group: 'Keyword', label: 'Focus keyword is set', pass: Boolean(keyword), weight: 8, tip: 'Add a focus keyword: the phrase people search for.' },
    { id: 'kw-title', group: 'Keyword', label: 'Keyword in the meta title', pass: has(metaTitle), weight: 7, tip: keyword ? 'Put the focus keyword in the meta title, near the start.' : noKeyword },
    { id: 'kw-desc', group: 'Keyword', label: 'Keyword in the meta description', pass: has(description), weight: 4, tip: keyword ? 'Use the focus keyword in the meta description.' : noKeyword },
    { id: 'kw-slug', group: 'Keyword', label: 'Keyword in the address', pass: Boolean(keyword) && input.slug.replace(/-/g, ' ').includes(keyword.replace(/[^a-z0-9 ]/g, '').trim() || '\u0000'), weight: 3, tip: keyword ? 'Use the focus keyword in the address (slug).' : noKeyword },
    { id: 'kw-first', group: 'Keyword', label: 'Keyword in the first 100 words', pass: Boolean(keyword) && first100.includes(keyword), weight: 5, tip: keyword ? 'Mention the focus keyword early, in the first paragraph.' : noKeyword },
    { id: 'kw-h2', group: 'Keyword', label: 'Keyword in a subheading', pass: h2s.some((h) => has(h.text)), weight: 4, tip: keyword ? 'Use the focus keyword in at least one H2.' : noKeyword },
    { id: 'kw-alt', group: 'Keyword', label: 'Keyword in an image alt text', pass: images.some((i) => i.alt && has(i.alt)), weight: 2, tip: keyword ? 'Describe one image with words that include the focus keyword.' : noKeyword },
    { id: 'kw-density', group: 'Keyword', label: 'Keyword density 0.5 to 2.5 percent', pass: density >= 0.5 && density <= 2.5, weight: 4, tip: !keyword ? noKeyword : density < 0.5 ? `Use the focus keyword a little more (now ${density.toFixed(1)}%).` : `Use the focus keyword less often; it reads as stuffing (now ${density.toFixed(1)}%).` },
    { id: 'kw-unique', group: 'Keyword', label: 'Keyword not used by another page', pass: Boolean(keyword) && input.keywordUsedBy.length === 0, weight: 3, tip: keyword ? `Another page targets the same keyword: ${input.keywordUsedBy.slice(0, 2).join(', ')}. Pick a different one.` : noKeyword },

    { id: 'length', group: 'Content', label: `At least ${MIN_WORDS[input.kind]} words`, pass: words >= MIN_WORDS[input.kind], weight: 8, tip: `Add more helpful content: ${words} of about ${MIN_WORDS[input.kind]} words.` },
    { id: 'headings', group: 'Content', label: 'Headings in order', pass: ordered && (words < 300 || h2s.length > 0), weight: 5, tip: words >= 300 && !h2s.length ? 'Break the text up with H2 subheadings.' : 'Do not skip heading levels (H2 then H3, not H2 then H4).' },
    { id: 'paragraphs', group: 'Content', label: 'Short paragraphs', pass: longParagraphs === 0, weight: 4, tip: 'Split paragraphs longer than about 150 words.' },
    { id: 'readability', group: 'Content', label: 'Easy to read', pass: avgSentence === 0 || avgSentence <= 22, weight: 4, tip: `Use shorter sentences (now about ${Math.round(avgSentence)} words each).` },
    { id: 'structure', group: 'Content', label: 'Lists or tables where useful', pass: words < 600 || input.content.lists + input.content.tables > 0, weight: 4, tip: 'Long pages read better with a list or a table.' },

    { id: 'image', group: 'Media and links', label: 'At least one image', pass: images.length > 0, weight: 5, tip: 'Add an image or a cover image.' },
    { id: 'alt', group: 'Media and links', label: 'Every image has alt text', pass: images.every((i) => Boolean(i.alt)), weight: 5, tip: `Add alt text to ${images.filter((i) => !i.alt).length} image(s), in the media library or the editor.` },
    { id: 'internal', group: 'Media and links', label: 'Links to other pages on this site', pass: internal.length > 0, weight: 6, tip: 'Link to at least one related page on your site.' },
    { id: 'external', group: 'Media and links', label: 'Links to sources', pass: input.kind === 'page' || input.kind === 'category' || external.length > 0, weight: 4, tip: 'Link to a trustworthy source that backs up your points.' },

    { id: 'title-length', group: 'Technical', label: 'Meta title 30 to 65 characters', pass: metaTitle.length >= 30 && metaTitle.length <= 65, weight: 4, tip: `Make the meta title 50 to 60 characters (now ${metaTitle.length}).` },
    { id: 'desc-length', group: 'Technical', label: 'Meta description 110 to 170 characters', pass: description.length >= 110 && description.length <= 170, weight: 4, tip: description ? `Make the meta description 120 to 160 characters (now ${description.length}).` : 'Write a meta description of 120 to 160 characters.' },
    { id: 'canonical', group: 'Technical', label: 'Canonical address is valid', pass: !canonical || /^(https?:\/\/[^\s]+|\/[^\s]*)$/.test(canonical), weight: 2, tip: 'The canonical address must be a full address or a path.' },
    { id: 'indexable', group: 'Technical', label: 'Can be listed and is in the sitemap', pass: !noindex && !excluded, weight: 3, tip: 'This page is hidden from search engines or left out of the sitemap. Change it in the SEO tab if that is not intended.' },
    { id: 'schema', group: 'Technical', label: 'Structured data present', pass: input.hasSchema, weight: 2, tip: 'Structured data is missing. Check the Schema tab.' },
  ];

  const total = checks.reduce((n, c) => n + c.weight, 0);
  const got = checks.reduce((n, c) => n + (c.pass ? c.weight : 0), 0);
  const score = Math.round((got / total) * 100);
  const fixes = checks.filter((c) => !c.pass).sort((a, b) => b.weight - a.weight).map((c) => c.tip);
  return { score, checks, fixes };
}
