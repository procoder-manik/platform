import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';
import { CURRENCY_OPTIONS, SUPPORTED_CURRENCIES } from '@/lib/checkout/money';
import { ISO_COUNTRIES } from './logic';

const country = z.string().trim().toUpperCase().refine((c) => c === '' || c === '*' || ISO_COUNTRIES.includes(c), 'Use two-letter country codes such as US or BD, or * for every other country.');

export const storeSettings = defineSettings({
  key: 'store',
  label: 'Store',
  description: 'The shop page, stock, tax classes and shipping rates.',
  area: 'shop',
  module: 'store',
  schema: z.object({
    title: z.string().trim().min(1).max(80),
    intro: z.string().max(400),
    perPage: z.number().int().min(4).max(60),
    currency: z.enum(SUPPORTED_CURRENCIES),
    holdHours: z.number().int().min(1).max(720),
    lowStockEmail: z.boolean(),
    showStockCount: z.boolean(),
    hideSoldOut: z.boolean(),
    taxClasses: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,30}$/, 'Use lower case letters, numbers and dashes.'), name: z.string().trim().min(1).max(60), ratePct: z.number().min(0).max(100) })).min(1, 'Keep at least one tax class.').max(12),
    taxOverrides: z.array(z.object({ classId: z.string().max(30), country, ratePct: z.number().min(0).max(100) })).max(200),
    shippingTaxClass: z.string().max(30),
    shippingRates: z.array(z.object({ zone: z.string().trim().min(1).max(60), countries: z.array(country).min(1, 'Add at least one country.').max(250), name: z.string().trim().min(1).max(60), kind: z.enum(['flat', 'weight', 'per_item', 'free']), price: z.number().int().min(0).nullable(), perKg: z.number().int().min(0).nullable(), freeOver: z.number().int().min(0).nullable() })).max(60),
  }),
  defaults: {
    title: 'Shop',
    intro: '',
    perPage: 12,
    currency: 'USD' as const,
    holdHours: 48,
    lowStockEmail: true,
    showStockCount: false,
    hideSoldOut: false,
    taxClasses: [{ id: 'standard', name: 'Standard', ratePct: 0 }],
    taxOverrides: [] as { classId: string; country: string; ratePct: number }[],
    shippingTaxClass: 'standard',
    shippingRates: [] as { zone: string; countries: string[]; name: string; kind: 'flat' | 'weight' | 'per_item' | 'free'; price: number | null; perKg: number | null; freeOver: number | null }[],
  },
  fields: [
    { name: 'title', label: 'Page title', type: 'text', required: true, maxLength: 80, tab: 'Shop page', width: 'half', info: 'The heading of the /shop page.' },
    { name: 'perPage', label: 'Products per page', type: 'number', required: true, min: 4, max: 60, tab: 'Shop page', width: 'half', info: 'How many products show before the next page.' },
    { name: 'intro', label: 'Intro', type: 'textarea', maxLength: 400, tab: 'Shop page', info: 'A line or two under the heading.' },
    { name: 'currency', label: 'Store currency', type: 'select', required: true, options: CURRENCY_OPTIONS, tab: 'Shop page', info: 'Every product, shipping price and tax threshold uses this currency. Products are saved in it automatically. Amounts the buyer pays are shown in it.' },
    { name: 'hideSoldOut', label: 'Hide sold out products', type: 'switch', tab: 'Stock', width: 'half', info: 'Off: sold out products stay visible and say so. On: they disappear from the shop until restocked.' },
    { name: 'showStockCount', label: 'Show how many are left', type: 'switch', tab: 'Stock', width: 'half', info: 'Shows "Only 3 left" when stock is at or below the product’s low stock level.' },
    { name: 'lowStockEmail', label: 'Email me when stock runs low', type: 'switch', tab: 'Stock', width: 'half', info: 'Sends an alert when a sale brings a variant to its low stock level or to zero.' },
    { name: 'holdHours', label: 'Hold unpaid orders for (hours)', type: 'number', required: true, min: 1, max: 720, tab: 'Stock', width: 'half', info: 'Stock is set aside when an order is placed. If it is not paid within this time, the order is cancelled and the stock goes back on sale. Manual payments such as bank transfer need longer.' },
    {
      name: 'taxClasses', label: 'Tax class', type: 'repeater', tab: 'Tax',
      info: 'Groups of products taxed at the same rate, for example Standard, Reduced, Digital. Each product picks one. Whether prices include tax is set in Settings > Payments.',
      fields: [
        { name: 'id', label: 'Id', type: 'text', required: true, maxLength: 30, width: 'half', pattern: { regex: '^[a-z0-9-]{1,30}$', message: 'Use lower case letters, numbers and dashes.' }, info: 'A short code the products use, for example standard or reduced. Do not change it once products use it.' },
        { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 60, width: 'half', info: 'What you see in the product editor.' },
        { name: 'ratePct', label: 'Rate (%)', type: 'number', required: true, min: 0, max: 100, info: 'The tax rate everywhere, unless a country below says otherwise.' },
      ],
    },
    {
      name: 'taxOverrides', label: 'Rate for a country', type: 'repeater', tab: 'Tax',
      info: 'A different rate for buyers in one country, for example VAT for EU buyers. The country is where the order is delivered, or the billing country for digital orders.',
      fields: [
        { name: 'classId', label: 'Tax class id', type: 'text', required: true, maxLength: 30, width: 'half', info: 'The id of the class this rate is for, for example standard.' },
        { name: 'country', label: 'Country', type: 'text', maxLength: 2, width: 'half', placeholder: 'DE', info: 'Two-letter country code. Leave empty for every country.' },
        { name: 'ratePct', label: 'Rate (%)', type: 'number', required: true, min: 0, max: 100, info: 'The tax rate for this class in this country.' },
      ],
    },
    { name: 'shippingTaxClass', label: 'Tax class for shipping', type: 'text', maxLength: 30, tab: 'Tax', info: 'The id of the tax class that applies to shipping charges. Empty means shipping is not taxed.' },
    {
      name: 'shippingRates', label: 'Shipping rate', type: 'repeater', tab: 'Shipping',
      info: 'Each row is one way to ship to a group of countries. Buyers see the rows for their country. A row for * covers every country not named elsewhere. Digital-only orders never need shipping.',
      fields: [
        { name: 'zone', label: 'Zone name', type: 'text', required: true, maxLength: 60, width: 'half', info: 'For example Bangladesh or Europe. Only for you.' },
        { name: 'name', label: 'Method name', type: 'text', required: true, maxLength: 60, width: 'half', info: 'What the buyer sees, for example Standard or Express.' },
        { name: 'countries', label: 'Countries', type: 'tags', required: true, info: 'Two-letter codes such as BD, DE, US. Use * for every other country.' },
        { name: 'kind', label: 'How it is priced', type: 'select', required: true, width: 'half', options: [{ value: 'flat', label: 'One price per order' }, { value: 'per_item', label: 'Price for each item' }, { value: 'weight', label: 'Base price plus a price per kilogram' }, { value: 'free', label: 'Free' }], info: 'How the shipping price is worked out.' },
        { name: 'price', label: 'Price', type: 'money', currency: 'currency', width: 'half', showIf: { field: 'kind', in: ['flat', 'per_item', 'weight'] }, info: 'The price of the order, of each item, or the base price, depending on the choice above.' },
        { name: 'perKg', label: 'Per kilogram', type: 'money', currency: 'currency', width: 'half', showIf: { field: 'kind', equals: 'weight' }, info: 'Added for every kilogram of the order. Products need a weight for this to work.' },
        { name: 'freeOver', label: 'Free over', type: 'money', currency: 'currency', width: 'half', info: 'Shipping becomes free when the products cost at least this much. Leave empty for no free shipping.' },
      ],
    },
  ],
});

export type StoreSettings = typeof storeSettings.defaults;
