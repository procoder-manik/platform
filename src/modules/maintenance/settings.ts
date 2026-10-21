import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

export const maintenanceSettings = defineSettings({
  key: 'maintenance',
  label: 'Maintenance page',
  description: 'What visitors see while maintenance mode is on. You stay signed in and the admin keeps working.',
  area: 'settings',
  module: 'maintenance',
  schema: z.object({ heading: z.string().trim().min(1).max(120), message: z.string().trim().max(600), contact: z.boolean() }),
  defaults: { heading: 'We are making some improvements', message: 'The site will be back shortly. Thank you for your patience.', contact: true },
  fields: [
    { name: 'heading', label: 'Heading', type: 'text', required: true, maxLength: 120, info: 'The main line on the maintenance page.' },
    { name: 'message', label: 'Message', type: 'textarea', maxLength: 600, info: 'A sentence or two, for example when the site will be back.' },
    { name: 'contact', label: 'Show the contact email', type: 'switch', info: 'Shows the email from Site and contact so visitors can still reach you.' },
  ],
});
