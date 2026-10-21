import { describe, expect, it } from 'vitest';
import { extractContent } from '@/lib/seo/extract';
import { scoreSeo, type SeoInput } from '@/lib/seo/score';
import { buildSchema, graphJson, type PageContext, type SiteContext } from '@/lib/seo/schema';
import { matchRedirect, type ProxyRedirect } from '@/lib/modules/proxy-state';
import { indexXml, urlsetXml } from '@/lib/seo/sitemap';
import { seoMetadata } from '@/lib/seo/meta';
import { markdownToDoc } from '@/lib/richtext/markdown';

const site: SiteContext = {
  url: 'https://example.com', name: 'Northlight', description: 'Web studio', logo: '/logo.png', social: ['https://github.com/x'], searchPath: '/blog?q=',
  entity: 'Organization', businessType: 'LocalBusiness',
  business: { name: '', legalName: 'Northlight Ltd', description: '', phone: '+880 1700 000000', email: 'hi@example.com', street: '1 Road', city: 'Dhaka', region: 'Dhaka', postalCode: '1207', country: 'BD', priceRange: '$$', areaServed: ['Dhaka'], hours: [{ days: ['Monday'], opens: '09:00', closes: '18:00' }] },
};
const page = (patch: Partial<PageContext>): PageContext => ({ kind: 'page', path: '/about', title: 'About', description: 'About us.', image: '/a.png', breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }], faq: [], seo: {}, ...patch });
const types = (nodes: ReturnType<typeof buildSchema>) => nodes.map((n) => n.type);

describe('schema graph', () => {
  it('builds the site nodes with a local business, search action and breadcrumbs', () => {
    const nodes = buildSchema(site, page({}));
    expect(types(nodes)).toEqual(['LocalBusiness', 'WebSite', 'WebPage', 'BreadcrumbList']);
    const biz = nodes[0]!.json;
    expect(biz.address).toMatchObject({ '@type': 'PostalAddress', addressLocality: 'Dhaka', addressCountry: 'BD' });
    expect(biz.openingHoursSpecification).toHaveLength(1);
    expect(JSON.stringify(nodes[1]!.json)).toContain('search_term_string');
    const crumbs = nodes[3]!.json.itemListElement as Record<string, unknown>[];
    expect(crumbs[0]).toMatchObject({ position: 1, name: 'Home', item: 'https://example.com/' });
    expect(crumbs[1]).not.toHaveProperty('item');
  });

  // Required and recommended properties from Google's rich result documentation.
  it.each([
    ['post', 'BlogPosting', ['headline', 'image', 'datePublished', 'author']],
    ['caseStudy', 'Article', ['headline', 'image', 'datePublished', 'author']],
    ['project', 'CreativeWork', ['name', 'url']],
    ['app', 'SoftwareApplication', ['name', 'applicationCategory', 'operatingSystem']],
  ] as const)('%s pages get %s with its required properties', (kind, type, required) => {
    const nodes = buildSchema(site, page({ kind, datePublished: '2026-01-01', author: { name: 'Sam', path: '/blog/author/1' } }));
    const node = nodes.find((n) => n.type === type);
    expect(node, type).toBeDefined();
    for (const key of required) expect(node!.json, `${type}.${key}`).toHaveProperty(key);
  });

  it('adds FAQPage from FAQ content and warns about gaps', () => {
    const nodes = buildSchema(site, page({ faq: [{ question: 'Q?', answer: 'A.' }], image: null, kind: 'post' }));
    const faq = nodes.find((n) => n.type === 'FAQPage');
    expect((faq!.json.mainEntity as unknown[]).length).toBe(1);
    expect(nodes.find((n) => n.type === 'BlogPosting')!.warnings.join(' ')).toMatch(/image/);
  });

  it('adds the type chosen in the Schema tab', () => {
    const event = buildSchema(site, page({ seo: { schemaType: 'Event', schema: { startDate: '2026-12-01T10:00:00Z', location: 'https://meet.example.com' } } })).find((n) => n.type === 'Event');
    expect(event!.json).toMatchObject({ eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', location: { '@type': 'VirtualLocation' } });
    const howto = buildSchema(site, page({ seo: { schemaType: 'HowTo', schema: { steps: [{ name: 'One' }, { name: 'Two' }] } } })).find((n) => n.type === 'HowTo');
    expect(howto!.json.step).toHaveLength(2);
  });

  it('cannot break out of the script element', () => {
    expect(graphJson(buildSchema(site, page({ title: '</script><script>alert(1)</script>' })))).not.toContain('</script>');
  });
});

describe('SEO score', () => {
  const body = markdownToDoc(`Website planning helps small teams launch faster. ${'Good planning saves time and money for everyone. '.repeat(40)}\n\n## Website planning steps\n\n- List pages\n- Write copy\n\nRead [our services](/services) and [this guide](https://web.dev/learn).`);
  const base = (patch: Partial<SeoInput> = {}): SeoInput => ({
    kind: 'post', title: 'Website planning for small teams', slug: 'website-planning', siteHost: 'example.com', hasSchema: true, keywordUsedBy: [],
    seo: { focusKeyword: 'website planning', title: 'Website planning for small teams: a simple guide', description: 'Website planning made simple: the steps, the costs and the mistakes to avoid when you plan a new site for a small team this year.' },
    content: { ...extractContent({ body, cover: '/c.png' }), images: [{ src: '/c.png', alt: 'Website planning board' }] },
    ...patch,
  });

  it('rewards a well-optimised post', () => {
    const r = scoreSeo(base());
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
  it('scores low without a keyword and explains why first', () => {
    const r = scoreSeo(base({ seo: {} }));
    expect(r.score).toBeLessThan(60);
    expect(r.fixes[0]).toMatch(/keyword/i);
  });
  it('flags a keyword used elsewhere and missing alt text', () => {
    const r = scoreSeo(base({ keywordUsedBy: ['Other post'], content: { ...base().content, images: [{ src: '/x.png', alt: null }] } }));
    expect(r.checks.find((c) => c.id === 'kw-unique')!.pass).toBe(false);
    expect(r.checks.find((c) => c.id === 'alt')!.pass).toBe(false);
  });
  it('never exceeds 100 and weights add up', () => {
    const r = scoreSeo(base());
    expect(r.checks.reduce((n, c) => n + c.weight, 0)).toBe(100);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('extractContent', () => {
  it('reads builder blocks: headings, FAQ, images and links', () => {
    const out = extractContent({ blocks: [
      { id: 'blk_a1b2', type: 'hero', props: { heading: 'Hello', intro: 'Intro text', buttons: [{ label: 'Go', href: '/contact' }] }, style: {} },
      { id: 'blk_a1b3', type: 'faq', props: { heading: 'FAQ', items: [{ question: 'Why?', answer: 'Because.' }] }, style: {} },
      { id: 'blk_a1b4', type: 'gallery', props: { images: ['/g.png'] }, style: {} },
      { id: 'blk_a1b5', type: 'richText', props: { content: 'Hidden' }, style: {}, hidden: true },
    ] });
    expect(out.headings[0]).toEqual({ level: 1, text: 'Hello' });
    expect(out.faq).toEqual([{ question: 'Why?', answer: 'Because.' }]);
    expect(out.images.map((i) => i.src)).toEqual(['/g.png']);
    expect(out.links).toContain('/contact');
    expect(out.text).not.toContain('Hidden');
  });
});

describe('redirect matching', () => {
  const list: ProxyRedirect[] = [
    { id: '1', from: '/old', to: '/new', code: 301, match: 'exact' },
    { id: '2', from: '/docs', to: '/help', code: 301, match: 'prefix' },
    { id: '3', from: '/docs/api', to: '/developers', code: 301, match: 'prefix' },
    { id: '4', from: '^/p/(\\d+)$', to: '/blog/post-$1', code: 302, match: 'regex' },
    { id: '5', from: '/gone', to: '', code: 410, match: 'exact' },
  ];
  it('matches exact, the longest prefix, then patterns', () => {
    expect(matchRedirect(list, '/old')?.to).toBe('/new');
    expect(matchRedirect(list, '/docs/setup')?.to).toBe('/help/setup');
    expect(matchRedirect(list, '/docs/api/keys')?.to).toBe('/developers/keys');
    expect(matchRedirect(list, '/documents')).toBeNull();
    expect(matchRedirect(list, '/p/42')?.to).toBe('/blog/post-42');
    expect(matchRedirect(list, '/gone')?.redirect.code).toBe(410);
  });
});

describe('sitemaps and metadata', () => {
  it('writes valid sitemap XML with images and escaping', () => {
    const xml = urlsetXml('https://example.com', [{ path: '/a?x=1&y=2', lastmod: '2026-01-01T00:00:00Z', images: ['/i.png'] }]);
    expect(xml).toContain('<loc>https://example.com/a?x=1&amp;y=2</loc>');
    expect(xml).toContain('<image:loc>https://example.com/i.png</image:loc>');
    expect(indexXml('https://example.com', ['pages'])).toContain('<loc>https://example.com/sitemaps/pages.xml</loc>');
  });
  it('builds robots and share metadata with fallbacks', () => {
    const meta = seoMetadata({ title: 'About', path: '/about', seo: { noindex: true, maxImagePreview: 'standard' } });
    expect(meta.robots).toMatchObject({ index: false, follow: true, 'max-image-preview': 'standard' });
    expect(JSON.stringify(meta.openGraph)).toContain('/og?title=About');
    expect(meta.alternates?.canonical).toBe('/about');
  });
});
