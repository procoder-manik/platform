import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

export const blogSettings = defineSettings({
  key: 'blog',
  label: 'Blog',
  description: 'How the blog archive and articles look.',
  area: 'blog',
  module: 'blog',
  schema: z.object({
    title: z.string().trim().min(1).max(80),
    intro: z.string().max(300),
    perPage: z.number().int().min(3).max(48),
    showAuthor: z.boolean(),
    showReadingTime: z.boolean(),
    showShare: z.boolean(),
    showRelated: z.boolean(),
    showProgress: z.boolean(),
    noindexTags: z.boolean(),
  }),
  defaults: { title: 'Blog', intro: '', perPage: 12, showAuthor: true, showReadingTime: true, showShare: true, showRelated: true, showProgress: true, noindexTags: true },
  fields: [
    { name: 'title', label: 'Blog title', type: 'text', required: true, maxLength: 80, info: 'The heading of the blog page, for example "Insights".' },
    { name: 'intro', label: 'Intro', type: 'textarea', maxLength: 300, info: 'A line under the blog heading.' },
    { name: 'perPage', label: 'Posts per page', type: 'number', min: 3, max: 48, required: true, info: 'How many posts each archive page lists.' },
    { name: 'showAuthor', label: 'Show the author box', type: 'switch', width: 'half', info: 'Name, photo and bio under each article.' },
    { name: 'showReadingTime', label: 'Show reading time', type: 'switch', width: 'half', info: 'For example "6 min read".' },
    { name: 'showShare', label: 'Show share links', type: 'switch', width: 'half', info: 'Links to share on LinkedIn, X, Facebook and WhatsApp, and to copy the address.' },
    { name: 'showRelated', label: 'Show related posts', type: 'switch', width: 'half', info: 'Up to three posts from the same category or with shared tags.' },
    { name: 'showProgress', label: 'Show reading progress bar', type: 'switch', width: 'half', info: 'A thin bar at the top that fills as people read.' },
    { name: 'noindexTags', label: 'Hide tag archives from search engines', type: 'switch', width: 'half', info: 'Tag pages often repeat the same posts. Hiding them keeps search results clean.' },
  ],
});
