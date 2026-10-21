import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

export const referralSettings = defineSettings({
  key: 'referrals',
  label: 'Referrals',
  description: 'What a friend gets, what the customer who shared their code earns, and the rules that stop abuse.',
  area: 'marketing',
  module: 'referrals',
  schema: z.object({
    friendKind: z.enum(['percent', 'fixed']),
    friendPercent: z.number().int().min(1).max(100),
    friendAmount: z.number().int().min(1).nullable(),
    rewardAmount: z.number().int().min(1).nullable(),
    rewardValidDays: z.number().int().min(1).max(3650),
    minSubtotal: z.number().int().min(0).nullable(),
    inviteAfterPaid: z.boolean(),
    codePrefix: z.string().regex(/^[A-Z0-9]{0,6}$/, 'Use up to 6 capital letters or numbers.'),
  }),
  defaults: { friendKind: 'percent' as const, friendPercent: 10, friendAmount: null as number | null, rewardAmount: null as number | null, rewardValidDays: 180, minSubtotal: null as number | null, inviteAfterPaid: true, codePrefix: 'FRIEND' },
  fields: [
    { name: 'friendKind', label: 'The friend gets', type: 'segmented', required: true, options: [{ value: 'percent', label: 'A percentage off' }, { value: 'fixed', label: 'A fixed amount off' }], info: 'The discount a new customer gets when they use a friend’s code on their first order.' },
    { name: 'friendPercent', label: 'Percentage off', type: 'number', required: true, min: 1, max: 100, width: 'half', showIf: { field: 'friendKind', equals: 'percent' }, info: 'For example 10 for 10% off the first order.' },
    { name: 'friendAmount', label: 'Amount off', type: 'money', width: 'half', showIf: { field: 'friendKind', equals: 'fixed' }, info: 'In your main currency (Settings > Payments).' },
    { name: 'rewardAmount', label: 'The referrer earns', type: 'money', tab: 'Reward', width: 'half', info: 'The value of the reward code the customer who shared their code receives after their friend’s order is paid. In your main currency. Leave empty for no reward.' },
    { name: 'rewardValidDays', label: 'Reward valid for (days)', type: 'number', required: true, min: 1, max: 3650, tab: 'Reward', width: 'half', info: 'How long the reward code works after it is created.' },
    { name: 'minSubtotal', label: 'Smallest first order', type: 'money', tab: 'Rules', width: 'half', info: 'The friend’s order must cost at least this much (before tax and shipping) for the discount and the reward. Leave empty for no minimum.' },
    { name: 'codePrefix', label: 'Code start', type: 'text', maxLength: 6, tab: 'Rules', width: 'half', placeholder: 'FRIEND', info: 'Customers’ codes look like FRIEND-K7QX2M. Use up to 6 capital letters or numbers.' },
    { name: 'inviteAfterPaid', label: 'Email customers their code', type: 'switch', tab: 'Rules', info: 'After a customer’s first paid order, email them their own code to share.' },
  ],
});
export type ReferralSettings = typeof referralSettings.defaults;

export const affiliateSettings = defineSettings({
  key: 'affiliates',
  label: 'Affiliates',
  description: 'The commission, how long a link counts, when commission is ready to pay, and who may join.',
  area: 'marketing',
  module: 'affiliates',
  schema: z.object({
    defaultPct: z.number().min(0).max(100),
    cookieDays: z.number().int().min(1).max(365),
    holdDays: z.number().int().min(0).max(180),
    minPayout: z.number().int().min(0),
    recurring: z.boolean(),
    signupsOpen: z.boolean(),
    autoApprove: z.boolean(),
    title: z.string().trim().min(1).max(80),
    intro: z.string().max(600),
    terms: z.string().max(1500),
    ownerAlerts: z.boolean(),
  }),
  defaults: { defaultPct: 10, cookieDays: 30, holdDays: 14, minPayout: 5000, recurring: false, signupsOpen: true, autoApprove: false, title: 'Become an affiliate', intro: 'Share us with your audience and earn a commission on every order you bring.', terms: '', ownerAlerts: true },
  fields: [
    { name: 'defaultPct', label: 'Commission (%)', type: 'number', required: true, min: 0, max: 100, width: 'half', info: 'Paid on what the customer pays for products or services, after discounts and without tax or shipping. Each affiliate can have their own rate.' },
    { name: 'cookieDays', label: 'Link lasts (days)', type: 'number', required: true, min: 1, max: 365, width: 'half', info: 'After someone clicks an affiliate link, orders they place within this time count for the affiliate. The latest link clicked wins.' },
    { name: 'holdDays', label: 'Hold before it is ready (days)', type: 'number', required: true, min: 0, max: 180, width: 'half', info: 'Commission becomes ready to pay this many days after the order is paid, so refunds can still cancel it.' },
    { name: 'minPayout', label: 'Smallest payout', type: 'money', required: true, width: 'half', info: 'The Payouts screen only offers affiliates whose ready commission reaches this amount. In your main currency.' },
    { name: 'recurring', label: 'Pay commission on subscription renewals', type: 'switch', info: 'On: renewals of a subscription an affiliate brought also earn commission. Off: only the first order does.' },
    { name: 'signupsOpen', label: 'Anyone can apply', type: 'switch', tab: 'Sign up', width: 'half', info: 'Shows the application form on the affiliate page.' },
    { name: 'autoApprove', label: 'Approve applications automatically', type: 'switch', tab: 'Sign up', width: 'half', info: 'Off: you approve each application in Marketing > Affiliates before the link works.' },
    { name: 'title', label: 'Page title', type: 'text', required: true, maxLength: 80, tab: 'Sign up', info: 'The heading of the affiliate page.' },
    { name: 'intro', label: 'Intro', type: 'textarea', maxLength: 600, tab: 'Sign up', info: 'What affiliates get and how it works.' },
    { name: 'terms', label: 'Programme rules', type: 'textarea', maxLength: 1500, tab: 'Sign up', info: 'Shown under the form, for example what is not allowed (paid ads on your brand name, self-orders).' },
    { name: 'ownerAlerts', label: 'Email me about applications', type: 'switch', tab: 'Sign up', info: 'Sends an alert when someone applies.' },
  ],
});
export type AffiliateSettings = typeof affiliateSettings.defaults;
