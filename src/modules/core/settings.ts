import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

export const siteSettings = defineSettings({
  key: 'site',
  label: 'Site and contact',
  description: 'The site name, contact details and time zone used across the site and in emails.',
  area: 'settings',
  module: 'core',
  schema: z.object({
    siteName: z.string().trim().min(1).max(80),
    tagline: z.string().trim().max(160),
    contactEmail: z.union([z.literal(''), z.email()]),
    timeZone: z.string().trim().min(1).max(64),
  }),
  defaults: {
    siteName: 'Your company',
    tagline: 'Replace this tagline in Admin > Settings > Site and contact.',
    contactEmail: '',
    timeZone: 'UTC',
  },
  fields: [
    { name: 'siteName', label: 'Site name', type: 'text', required: true, info: 'Shown in the header, browser tab, emails and search results.' },
    { name: 'tagline', label: 'Tagline', type: 'text', info: 'A short line about what you do. Used on the home page and as a fallback description.' },
    { name: 'contactEmail', label: 'Contact email', type: 'email', info: 'Where visitors can reach you. Shown on the contact page.' },
    { name: 'timeZone', label: 'Time zone', type: 'text', placeholder: 'Asia/Dhaka', info: 'Dates on the site and in emails are shown in this time zone. Use a name like Europe/London.' },
  ],
});
