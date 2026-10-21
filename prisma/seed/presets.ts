/**
 * Starting content for a new client site. Every text is a clearly marked placeholder: no invented clients,
 * numbers, quotes or reviews. Pick one with SEED_PRESET=freelancer npm run db:seed (or --preset=freelancer).
 */
import { PAGE_TEMPLATES } from '../../src/lib/blocks/templates';
import { newBlockId, type Block } from '../../src/lib/blocks/types';
import { markdownToDoc } from '../../src/lib/richtext/markdown';

export interface PresetPage {
  title: string;
  slug: string;
  template: keyof typeof PAGE_TEMPLATES;
  isHome?: boolean;
  showInFooter?: boolean;
  extra?: Block[];
}

export interface SeedPreset {
  id: string;
  label: string;
  brand: string;
  modules: Record<string, boolean>;
  pages: PresetPage[];
  menu: { label: string; href: string }[];
  posts?: { title: string; slug: string; markdown: string; tags: string[] }[];
  categories?: { name: string; slug: string }[];
  projects?: { title: string; slug: string; summary: string; platform: string; services: string[] }[];
  /** Placeholder services and packages. They are saved switched off with no prices: the owner fills them in. */
  services?: { name: string; slug: string; summary: string; packages: { name: string; slug: string; tagline: string }[] }[];
}

const fresh = (blocks: Block[]): Block[] => blocks.map((b) => ({ ...b, id: newBlockId(), children: b.children ? fresh(b.children) : undefined }));
export const templateBlocks = (t: keyof typeof PAGE_TEMPLATES, extra: Block[] = []) => fresh([...(PAGE_TEMPLATES[t]?.blocks() ?? []), ...extra]);

const samplePost = (topic: string) =>
  markdownToDoc(`This is a sample post about ${topic}. Replace it with your own writing, or delete it.

## Why this matters

Explain the problem your reader has, in their words.

## How to approach it

### Step one

Describe the first step.

### Step two

Describe the next step.

## Frequently asked questions

### Is this a real article?

No. It is a placeholder so you can see how posts look. Replace it before launch.
`);

const block = (type: string, props: Record<string, unknown>, style: Block['style'] = {}): Block => ({ id: newBlockId(), type, props, style });

export const PRESETS: Record<string, SeedPreset> = {
  blank: { id: 'blank', label: 'Blank', brand: 'blueprint', modules: {}, pages: [{ title: 'Home', slug: 'home', template: 'blank', isHome: true }], menu: [{ label: 'Home', href: '/' }] },
  freelancer: {
    id: 'freelancer',
    label: 'Freelancer',
    brand: 'clean',
    modules: { blog: true, portfolio: true, resume: true, testimonials: true, services: false, checkout: false, accounts: false, chat: false, knowledge: false },
    pages: [
      { title: 'Home', slug: 'home', template: 'home', isHome: true, extra: [block('portfolioGrid', { heading: 'Selected work', intro: '', featuredOnly: false, count: 4, columns: 2 }), block('blogPosts', { heading: 'Writing', source: 'latest', count: 3, layoutMode: 'grid', columns: 3 })] },
      { title: 'About', slug: 'about', template: 'about', showInFooter: true },
      { title: 'Contact', slug: 'contact', template: 'contact', showInFooter: true },
    ],
    menu: [{ label: 'Work', href: '/portfolio' }, { label: 'Writing', href: '/blog' }, { label: 'About', href: '/about' }, { label: 'Resume', href: '/resume' }, { label: 'Contact', href: '/contact' }],
    categories: [{ name: 'Notes', slug: 'notes' }],
    posts: [{ title: 'Sample post: how I work', slug: 'how-i-work', markdown: '', tags: ['process'] }],
    projects: [
      { title: 'Sample project one', slug: 'sample-project-one', summary: 'Replace with a real project: the client, the brief and the result.', platform: 'Next.js', services: ['Design', 'Development'] },
      { title: 'Sample project two', slug: 'sample-project-two', summary: 'Replace with a real project and upload a full-page screenshot.', platform: 'WordPress', services: ['Development'] },
    ],
  },
  agency: {
    id: 'agency',
    label: 'Agency',
    brand: 'blueprint',
    modules: { blog: true, portfolio: true, caseStudies: true, testimonials: true, services: true, checkout: true, forms: true, knowledge: true, chat: true },
    pages: [
      { title: 'Home', slug: 'home', template: 'home', isHome: true, extra: [block('portfolioGrid', { heading: 'Our work', featuredOnly: true, count: 4, columns: 2 }), block('caseStudyList', { heading: 'Case studies', count: 2 })] },
      { title: 'About', slug: 'about', template: 'about', showInFooter: true },
      { title: 'Services', slug: 'services', template: 'services' },
      { title: 'Contact', slug: 'contact', template: 'contact', showInFooter: true },
      { title: 'Thank you', slug: 'thank-you', template: 'thanks' },
    ],
    menu: [{ label: 'Services', href: '/services' }, { label: 'Work', href: '/portfolio' }, { label: 'Case studies', href: '/case-studies' }, { label: 'Blog', href: '/blog' }, { label: 'Contact', href: '/contact' }],
    categories: [{ name: 'Guides', slug: 'guides' }, { name: 'News', slug: 'news' }],
    posts: [{ title: 'Sample post: choosing a website partner', slug: 'choosing-a-website-partner', markdown: '', tags: ['guides'] }],
    projects: [{ title: 'Sample client project', slug: 'sample-client-project', summary: 'Replace with a real project.', platform: 'Next.js', services: ['Design', 'Development', 'SEO'] }],
    services: [{ name: 'Websites', slug: 'websites', summary: 'Replace with what this service is.', packages: [{ name: 'Starter', slug: 'websites-starter', tagline: 'Replace this tagline' }, { name: 'Business', slug: 'websites-business', tagline: 'Replace this tagline' }, { name: 'Pro', slug: 'websites-pro', tagline: 'Replace this tagline' }] }],
  },
  shop: {
    id: 'shop',
    label: 'Shop',
    brand: 'warm',
    modules: { store: true, checkout: true, accounts: true, reviews: true, coupons: true, blog: true, portfolio: false, services: false },
    pages: [
      { title: 'Home', slug: 'home', template: 'landing', isHome: true },
      { title: 'About', slug: 'about', template: 'about', showInFooter: true },
      { title: 'Contact', slug: 'contact', template: 'contact', showInFooter: true },
    ],
    menu: [{ label: 'Shop', href: '/shop' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }],
  },
  local: {
    id: 'local',
    label: 'Local business',
    brand: 'calm',
    modules: { knowledge: true, chat: true, forms: true, testimonials: true, blog: false, portfolio: false, services: true, checkout: false },
    pages: [
      { title: 'Home', slug: 'home', template: 'home', isHome: true },
      { title: 'Services', slug: 'services', template: 'services' },
      { title: 'Contact', slug: 'contact', template: 'contact', showInFooter: true },
    ],
    menu: [{ label: 'Services', href: '/services' }, { label: 'FAQ', href: '/faq' }, { label: 'Contact', href: '/contact' }],
  },
};

export function postBody(title: string) {
  return samplePost(title.replace(/^Sample post:\s*/i, ''));
}
