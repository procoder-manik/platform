import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

export const appsSettings = defineSettings({
  key: 'apps',
  label: 'Products page',
  description: 'The /apps page that lists your own products.',
  area: 'content',
  module: 'productsShowcase',
  schema: z.object({ title: z.string().trim().min(1).max(80), intro: z.string().max(300) }),
  defaults: { title: 'Our products', intro: '' },
  fields: [
    { name: 'title', label: 'Page title', type: 'text', required: true, maxLength: 80, info: 'The heading of the products page and the footer column.' },
    { name: 'intro', label: 'Intro', type: 'textarea', maxLength: 300, info: 'A line under the heading.' },
  ],
});
