/**
 * Starting layouts for new pages. Text is placeholder copy, clearly marked for replacement.
 * Never put invented statistics, clients or quotes here.
 */
import type { Block } from './types';

let n = 0;
const b = (type: string, props: Record<string, unknown>, style: Block['style'] = {}): Block => ({ id: `blk_tpl${(n++).toString(36).padStart(4, '0')}`, type, props, style });

export const PAGE_TEMPLATES: Record<string, { label: string; blocks: () => Block[] }> = {
  blank: { label: 'Blank', blocks: () => [] },
  home: {
    label: 'Home',
    blocks: () => [
      b('hero', { variant: 'text', heading: 'Replace this with what you do, for whom', intro: 'One or two sentences on the result you deliver. Edit this in the page builder.', buttons: [{ label: 'Start a project', href: '/contact', variant: 'primary' }, { label: 'See our work', href: '/#work', variant: 'ghost' }] }, { paddingTop: 'xl', paddingBottom: 'lg' }),
      b('featureGrid', { heading: 'What we do', intro: '', template: 'service', layoutMode: 'grid', columns: 3, items: [1, 2, 3].map((i) => ({ title: `Service ${i}`, body: 'Describe this service in one or two sentences.', icon: 'sparkles' })) }),
      b('steps', { heading: 'How it works', template: 'numbered', layoutMode: 'grid', columns: 3, items: ['Talk', 'Plan', 'Launch'].map((title) => ({ title, body: 'Describe this step.' })) }, { background: 'raised' }),
      b('cta', { heading: 'Ready to start?', intro: 'Tell us about your project and we will reply within a working day.', buttons: [{ label: 'Contact us', href: '/contact', variant: 'primary' }] }, { background: 'raised', align: 'center' }),
    ],
  },
  about: {
    label: 'About',
    blocks: () => [
      b('hero', { variant: 'text', heading: 'About us', intro: 'Replace this with a short story of who you are.', buttons: [] }, { paddingTop: 'xl' }),
      b('imageText', { heading: 'Our story', content: 'Write two or three short paragraphs about how you started and what you care about.', imageSide: 'right', buttons: [] }),
      b('team', { heading: 'The team', template: 'team', layoutMode: 'grid', columns: 3, items: [{ title: 'Your name', role: 'Your role', body: 'A line about you.' }] }),
      b('cta', { heading: 'Work with us', buttons: [{ label: 'Get in touch', href: '/contact', variant: 'primary' }] }, { background: 'raised', align: 'center' }),
    ],
  },
  services: {
    label: 'Services',
    blocks: () => [
      b('hero', { variant: 'text', heading: 'Services', intro: 'Replace this with a summary of what you offer.', buttons: [] }, { paddingTop: 'xl' }),
      b('cards', { heading: '', template: 'service', layoutMode: 'grid', columns: 3, items: [1, 2, 3].map((i) => ({ title: `Service ${i}`, body: 'What it includes and who it is for.', href: '/contact', icon: 'layers' })) }),
      b('faq', { heading: 'Questions', items: [{ question: 'Replace with a real question', answer: 'And its answer.' }] }),
    ],
  },
  landing: {
    label: 'Landing page',
    blocks: () => [
      b('hero', { variant: 'image-right', heading: 'Replace with the one promise of this page', intro: 'Who it is for and what they get.', buttons: [{ label: 'Get started', href: '/contact', variant: 'primary' }] }, { paddingTop: 'xl' }),
      b('featureGrid', { heading: 'Why it works', template: 'glow', layoutMode: 'grid', columns: 3, items: [1, 2, 3].map((i) => ({ title: `Benefit ${i}`, body: 'Explain the benefit.', icon: 'check' })) }),
      b('faq', { heading: 'Questions', items: [] }),
      b('cta', { heading: 'Get started today', buttons: [{ label: 'Get started', href: '/contact', variant: 'primary' }] }, { background: 'primary', align: 'center' }),
    ],
  },
  contact: {
    label: 'Contact',
    blocks: () => [
      b('hero', { variant: 'text', heading: 'Contact', intro: 'Tell us what you need. We reply within one working day.', buttons: [] }, { paddingTop: 'xl', paddingBottom: 'sm' }),
      b('contactForm', { heading: '', showPhone: true, success: 'Thank you. We will reply soon.' }, { width: 'narrow' }),
    ],
  },
  pricing: {
    label: 'Pricing',
    blocks: () => [
      b('hero', { variant: 'text', heading: 'Pricing', intro: 'Replace with a line about how you price.', buttons: [] }, { paddingTop: 'xl', align: 'center' }),
      b('pricingTable', { template: 'price', layoutMode: 'grid', columns: 3, items: ['Starter', 'Business', 'Pro'].map((title, i) => ({ title, price: 'Your price', period: '', features: ['What is included'], linkLabel: 'Choose', href: '/contact', badge: i === 1 ? 'Popular' : '' })) }),
      b('faq', { heading: 'Questions about pricing', items: [] }),
    ],
  },
  thanks: {
    label: 'Thank you',
    blocks: () => [b('hero', { variant: 'text', heading: 'Thank you', intro: 'We have your message and will reply soon.', buttons: [{ label: 'Back to the home page', href: '/', variant: 'ghost' }] }, { paddingTop: 'xl', align: 'center' })],
  },
};
