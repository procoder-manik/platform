import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

export const portfolioSettings = defineSettings({
  key: 'portfolio',
  label: 'Portfolio',
  description: 'The portfolio page and project cards.',
  area: 'content',
  module: 'portfolio',
  schema: z.object({ title: z.string().trim().min(1).max(80), intro: z.string().max(300), scrollSpeed: z.number().int().min(100).max(2000), showFilters: z.boolean() }),
  defaults: { title: 'Our work', intro: '', scrollSpeed: 600, showFilters: true },
  fields: [
    { name: 'title', label: 'Page title', type: 'text', required: true, maxLength: 80, info: 'The heading of the portfolio page.' },
    { name: 'intro', label: 'Intro', type: 'textarea', maxLength: 300, info: 'A line under the heading.' },
    { name: 'scrollSpeed', label: 'Screenshot scroll speed (pixels per second)', type: 'number', min: 100, max: 2000, required: true, info: 'How fast the full-page screenshot scrolls on hover. 600 feels natural.' },
    { name: 'showFilters', label: 'Show filters', type: 'switch', info: 'Lets visitors filter by platform and service.' },
  ],
});
