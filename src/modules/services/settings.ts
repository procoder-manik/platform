import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

export const servicesSettings = defineSettings({
  key: 'services',
  label: 'Pricing page',
  description: 'The /pricing page and how package cards behave.',
  area: 'shop',
  module: 'services',
  schema: z.object({ title: z.string().trim().min(1).max(80), intro: z.string().max(400), defaultPeriod: z.enum(['monthly', 'yearly']), showEffectiveMonthly: z.boolean(), contactHref: z.string().max(300) }),
  defaults: { title: 'Pricing', intro: '', defaultPeriod: 'yearly' as const, showEffectiveMonthly: true, contactHref: '/contact' },
  fields: [
    { name: 'title', label: 'Page title', type: 'text', required: true, maxLength: 80, info: 'The heading of the pricing page.' },
    { name: 'intro', label: 'Intro', type: 'textarea', maxLength: 400, info: 'A line or two under the heading.' },
    { name: 'defaultPeriod', label: 'Shown first', type: 'segmented', required: true, options: [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }], info: 'Which choice the monthly and yearly switch starts on.' },
    { name: 'showEffectiveMonthly', label: 'Show the monthly cost of yearly plans', type: 'switch', info: 'Under a yearly price, shows what it comes to per month.' },
    { name: 'contactHref', label: 'Quote page', type: 'text', maxLength: 300, info: 'Where "Request a quote" buttons go. The package name is added to the address.' },
  ],
});
