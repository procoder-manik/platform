import 'server-only';
import { renderRichText } from '@/lib/richtext/render';
import type { ResourceHooks } from '@/lib/admin/hooks';

/** Renders rich text to HTML on save, so public pages never parse JSON. */
function withHtml(values: Record<string, unknown>): Record<string, unknown> {
  if ('body' in values) {
    const rendered = values.body ? renderRichText(values.body) : null;
    values.bodyHtml = rendered?.html ?? null;
    return { ...values, __words: rendered?.readingMinutes ?? 1 };
  }
  return values;
}

/** Hooks for the content modules (blog, portfolio, products showcase). */
export const contentHooks: Record<string, ResourceHooks> = {
  posts: {
    async beforeSave(values, { existing, staff, isNew }) {
      const { __words, ...v } = withHtml(values);
      if (__words !== undefined) v.readingMinutes = __words;
      if (isNew && !v.authorId) v.authorId = staff.id;
      if (v.status !== undefined && v.status !== 'SCHEDULED') v.publishAt = null;
      // First publish time, kept stable on later edits so feeds and sitemaps stay correct.
      if (v.status === 'PUBLISHED' && !existing?.publishedAt) v.publishedAt = new Date();
      if (v.status === 'SCHEDULED' && v.publishAt) v.publishedAt = v.publishAt;
      return v;
    },
  },
  projects: {
    async beforeSave(values) {
      const { __words: _w, ...v } = withHtml(values);
      return v;
    },
  },
  apps: {
    async beforeSave(values) {
      const { __words: _w, ...v } = withHtml(values);
      return v;
    },
  },
};
