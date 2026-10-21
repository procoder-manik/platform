import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';
import { parseReminderDays } from './schedule';

export const subscriptionSettings = defineSettings({
  key: 'subscriptions',
  label: 'Subscriptions',
  description: 'How plans renew: invoices, reminders, the grace period and what customers can do themselves.',
  area: 'shop',
  module: 'subscriptions',
  schema: z.object({
    numberPrefix: z.string().regex(/^[A-Z0-9]{2,6}$/, 'Use 2 to 6 capital letters or numbers.'),
    leadDays: z.number().int().min(1, 'Use at least 1 day.').max(60, 'Use 60 days or fewer.'),
    reminderDays: z.string().max(40).refine((v) => parseReminderDays(v) !== null, 'Write whole days between 1 and 60 separated by commas, for example 7, 3, 1.'),
    graceDays: z.number().int().min(0, 'Use 0 or more days.').max(60, 'Use 60 days or fewer.'),
    renewalPrice: z.enum(['locked', 'current']),
    customerCanStop: z.boolean(),
    customerCanRestart: z.boolean(),
    refundEndsPlan: z.boolean(),
    ownerAlerts: z.boolean(),
  }),
  defaults: {
    numberPrefix: 'SUB',
    leadDays: 7,
    reminderDays: '7, 3, 1',
    graceDays: 3,
    renewalPrice: 'locked' as const,
    customerCanStop: true,
    customerCanRestart: true,
    refundEndsPlan: true,
    ownerAlerts: true,
  },
  fields: [
    { name: 'leadDays', label: 'Send the renewal invoice this many days early', type: 'number', required: true, min: 1, max: 60, tab: 'Renewals', width: 'half', info: 'The renewal order is created this many days before the plan ends and emailed to the customer, who pays it like any other order. The new term starts when the current one ends.' },
    { name: 'graceDays', label: 'Grace period (days)', type: 'number', required: true, min: 0, max: 60, tab: 'Renewals', width: 'half', info: 'How long a plan stays active after its end date while the renewal is unpaid. Paying inside this time continues the plan with no gap. After it, the plan expires.' },
    { name: 'reminderDays', label: 'Reminder emails', type: 'text', maxLength: 40, tab: 'Renewals', placeholder: '7, 3, 1', info: 'Days before the end date when an unpaid renewal is reminded, separated by commas. Leave empty to send only the renewal invoice.' },
    { name: 'renewalPrice', label: 'Renewal price', type: 'segmented', required: true, tab: 'Renewals', options: [{ value: 'locked', label: 'Keep the price they signed up at' }, { value: 'current', label: 'Follow the package price' }], info: 'Locked: customers renew at the price they first paid, even if you raise the package price later. Follow: each renewal uses the package price at that time. Tax is always worked out again at renewal.' },
    { name: 'numberPrefix', label: 'Subscription number prefix', type: 'text', required: true, maxLength: 6, tab: 'Customers', width: 'half', placeholder: 'SUB', info: 'Numbers look like SUB-261020-K7QX. Use 2 to 6 capital letters or numbers.' },
    { name: 'customerCanStop', label: 'Customers can stop renewing', type: 'switch', tab: 'Customers', info: 'Shows a "Stop renewing" button on the customer’s plan page. The plan keeps working until the end of the paid term.' },
    { name: 'customerCanRestart', label: 'Customers can restart an ended plan', type: 'switch', tab: 'Customers', info: 'Shows a "Start again" button after a plan has expired or ended. It creates a new invoice for a fresh term starting on the day it is paid.' },
    { name: 'refundEndsPlan', label: 'A full refund of the latest term ends the plan', type: 'switch', tab: 'Customers', info: 'When the order for the current term is fully refunded, the plan is cancelled at once. Off: the plan only gets a note and you decide.' },
    { name: 'ownerAlerts', label: 'Email me about new and ended plans', type: 'switch', tab: 'Customers', info: 'Sends a short alert when a plan starts, expires or is stopped by the customer.' },
  ],
});

export type SubscriptionSettings = typeof subscriptionSettings.defaults;
