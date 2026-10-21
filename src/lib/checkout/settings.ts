import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';
import { CURRENCY_OPTIONS, SUPPORTED_CURRENCIES } from './money';
import { METHODS, METHOD_IDS, type MethodId } from './methods';

const method = z.object({ id: z.enum(METHOD_IDS as [MethodId, ...MethodId[]]), enabled: z.boolean(), label: z.string().max(80), details: z.string().max(1500), testMode: z.boolean() });

export const paymentSettings = defineSettings({
  key: 'payments',
  label: 'Payments',
  description: 'Which payment methods are offered, currency, order numbers, tax and invoice details.',
  area: 'payments',
  module: 'checkout',
  schema: z.object({
    currency: z.enum(SUPPORTED_CURRENCIES),
    localCurrency: z.string().max(3),
    localRate: z.number().min(0).max(1_000_000).nullable(),
    methods: z.array(method).max(20),
    orderPrefix: z.string().regex(/^[A-Z0-9]{2,6}$/, 'Use 2 to 6 capital letters or numbers.'),
    invoicePrefix: z.string().regex(/^[A-Z0-9]{2,6}$/, 'Use 2 to 6 capital letters or numbers.'),
    taxRatePct: z.number().min(0).max(100),
    taxInclusive: z.boolean(),
    taxLabel: z.string().max(30),
    requireTerms: z.boolean(),
    termsUrl: z.string().max(500),
    ownerEmail: z.string().max(254),
    companyName: z.string().max(120),
    companyAddress: z.string().max(400),
    taxId: z.string().max(60),
    invoiceFooter: z.string().max(400),
  }),
  defaults: {
    currency: 'USD',
    localCurrency: '',
    localRate: null,
    methods: METHODS.map((m) => ({ id: m.id, enabled: false, label: m.label, details: '', testMode: true })),
    orderPrefix: 'WL',
    invoicePrefix: 'INV',
    taxRatePct: 0,
    taxInclusive: false,
    taxLabel: 'VAT',
    requireTerms: false,
    termsUrl: '',
    ownerEmail: '',
    companyName: '',
    companyAddress: '',
    taxId: '',
    invoiceFooter: 'Thank you for your business.',
  },
  fields: [
    { name: 'currency', label: 'Main currency', type: 'select', required: true, options: CURRENCY_OPTIONS, tab: 'Methods', width: 'half', info: 'The default for new packages and the currency amounts are shown in. Each package keeps its own currency.' },
    { name: 'localCurrency', label: 'Local currency for manual methods', type: 'select', tab: 'Methods', width: 'half', options: [{ value: '', label: 'Not used' }, ...CURRENCY_OPTIONS], info: 'Mobile money and bank transfers can show the amount in this currency, for example BDT.' },
    { name: 'localRate', label: 'Local currency rate', type: 'number', min: 0, max: 1_000_000, tab: 'Methods', info: 'How many local units one main-currency unit is worth, for example 122 when 1 USD is 122 BDT. Applies to orders in the main currency. Update it when rates move.' },
    {
      name: 'methods', label: 'Payment method', type: 'repeater', tab: 'Methods',
      info: 'The order here is the order at checkout. A card or wallet method also needs its keys under Settings, API keys. Methods without them stay hidden.',
      fields: [
        { name: 'id', label: 'Method', type: 'select', required: true, width: 'half', options: METHODS.map((m) => ({ value: m.id, label: m.label })), info: 'Which payment method this row sets up.' },
        { name: 'enabled', label: 'Offer at checkout', type: 'switch', width: 'half', info: 'Switch off to hide the method without losing its details.' },
        { name: 'label', label: 'Name shown', type: 'text', maxLength: 80, info: 'What buyers see, for example "bKash (personal)".' },
        { name: 'details', label: 'Payment details', type: 'textarea', maxLength: 1500, info: 'For manual methods: the account number, account name and any instructions buyers need. Shown after they place the order. Not used by card and wallet methods.' },
        { name: 'testMode', label: 'Test mode', type: 'switch', info: 'For PayPal and SSLCommerz: use the sandbox. For Stripe the key decides (test keys start with sk_test_). Switch off when you go live.' },
      ],
    },
    { name: 'orderPrefix', label: 'Order number prefix', type: 'text', required: true, maxLength: 6, tab: 'Orders', width: 'half', placeholder: 'WL', info: 'Order numbers look like WL-261019-K7QX. Use 2 to 6 capital letters or numbers.' },
    { name: 'invoicePrefix', label: 'Invoice number prefix', type: 'text', required: true, maxLength: 6, tab: 'Orders', width: 'half', placeholder: 'INV', info: 'Invoice numbers look like INV-2026-0001 and are numbered in order.' },
    { name: 'ownerEmail', label: 'Order alert email', type: 'email', tab: 'Orders', info: 'Where new orders and payment proofs are sent. Empty uses NOTIFY_EMAIL, then the contact email.' },
    { name: 'requireTerms', label: 'Buyers must accept terms', type: 'switch', tab: 'Orders', width: 'half', info: 'Adds a tick box at checkout.' },
    { name: 'termsUrl', label: 'Terms address', type: 'text', maxLength: 500, tab: 'Orders', width: 'half', info: 'Where the terms live, for example /terms. Shown as a link next to the tick box.' },
    { name: 'taxRatePct', label: 'Tax rate (%)', type: 'number', min: 0, max: 100, tab: 'Tax and invoice', width: 'half', info: 'One flat rate for services. Use 0 if you do not charge tax.' },
    { name: 'taxLabel', label: 'Tax name', type: 'text', maxLength: 30, tab: 'Tax and invoice', width: 'half', info: 'Shown on invoices, for example VAT or GST.' },
    { name: 'taxInclusive', label: 'Prices already include tax', type: 'switch', tab: 'Tax and invoice', info: 'On: the tax is shown inside the price. Off: tax is added at checkout.' },
    { name: 'companyName', label: 'Company name', type: 'text', maxLength: 120, tab: 'Tax and invoice', width: 'half', info: 'Printed at the top of invoices. Empty uses the site name.' },
    { name: 'taxId', label: 'Tax or company number', type: 'text', maxLength: 60, tab: 'Tax and invoice', width: 'half', info: 'For example your VAT or BIN number.' },
    { name: 'companyAddress', label: 'Company address', type: 'textarea', maxLength: 400, tab: 'Tax and invoice', info: 'Printed on invoices, one line per row.' },
    { name: 'invoiceFooter', label: 'Invoice footer', type: 'text', maxLength: 400, tab: 'Tax and invoice', info: 'A line at the bottom of every invoice, for example payment terms or thanks.' },
  ],
});

export type PaymentSettings = typeof paymentSettings.defaults;
