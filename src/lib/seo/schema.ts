/**
 * One JSON-LD @graph per page, built from settings and content. Pure: the same builder runs for the live page
 * and for the admin Schema panel (which shows each node, a plain explanation and warnings).
 */
export type Json = Record<string, unknown>;

export interface SiteContext {
  url: string;
  name: string;
  description: string;
  logo: string | null;
  social: string[];
  searchPath: string | null;
  entity: 'Organization' | 'Person';
  businessType: 'Organization' | 'ProfessionalService' | 'LocalBusiness';
  business: {
    name: string; legalName: string; description: string; phone: string; email: string; street: string; city: string; region: string;
    postalCode: string; country: string; priceRange: string; areaServed: string[]; hours: { days?: string[]; opens?: string; closes?: string }[];
  };
}

export interface PageContext {
  kind: 'home' | 'page' | 'post' | 'project' | 'caseStudy' | 'app' | 'category' | 'collection';
  path: string;
  title: string;
  description: string | null;
  image: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  author?: { name: string; path: string } | null;
  section?: string | null;
  keywords?: string[];
  breadcrumbs: { name: string; path: string }[];
  faq: { question: string; answer: string }[];
  appUrl?: string | null;
  /** Packages with a public price, for Service and Offer nodes. */
  offers?: { service: string; name: string; description: string; price: string; currency: string; url: string }[];
  seo: Record<string, unknown>;
}

export interface SchemaNode {
  type: string;
  explanation: string;
  warnings: string[];
  json: Json;
}

const abs = (base: string, path: string | null | undefined) => (!path ? undefined : /^https?:\/\//.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`);
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : undefined);
const clean = (o: Json): Json => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)));

export function buildSchema(site: SiteContext, page: PageContext): SchemaNode[] {
  const base = site.url.replace(/\/$/, '');
  const url = abs(base, page.path) as string;
  const orgId = `${base}/#organization`;
  const siteId = `${base}/#website`;
  const nodes: SchemaNode[] = [];
  const b = site.business;
  const name = b.name || site.name;

  // Who is behind the site.
  const isLocal = site.entity === 'Organization' && site.businessType === 'LocalBusiness';
  const orgType = site.entity === 'Person' ? 'Person' : site.businessType;
  const address = b.street || b.city ? clean({ '@type': 'PostalAddress', streetAddress: b.street, addressLocality: b.city, addressRegion: b.region, postalCode: b.postalCode, addressCountry: b.country }) : undefined;
  const org = clean({
    '@type': orgType,
    '@id': orgId,
    name,
    legalName: site.entity === 'Organization' ? b.legalName : undefined,
    url: `${base}/`,
    description: b.description || site.description,
    ...(site.entity === 'Person' ? { image: abs(base, site.logo) } : { logo: site.logo ? clean({ '@type': 'ImageObject', url: abs(base, site.logo) }) : undefined, image: abs(base, site.logo) }),
    telephone: b.phone,
    email: b.email,
    address,
    priceRange: orgType !== 'Person' && orgType !== 'Organization' ? b.priceRange : undefined,
    areaServed: b.areaServed,
    sameAs: site.social,
    openingHoursSpecification: isLocal ? b.hours.filter((h) => h.days?.length && h.opens && h.closes).map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes })) : undefined,
  });
  const orgWarnings = [
    ...(site.entity === 'Organization' && !site.logo ? ['No logo: add one in SEO settings or Brand.'] : []),
    ...(isLocal && !address ? ['Local businesses need a street address and city.'] : []),
    ...(isLocal && !b.phone ? ['Add a phone number for local results.'] : []),
  ];
  nodes.push({ type: orgType, explanation: site.entity === 'Person' ? 'Tells search engines this site belongs to a person.' : 'Tells search engines who runs the site, with contact details.', warnings: orgWarnings, json: org });

  nodes.push({
    type: 'WebSite',
    explanation: site.searchPath ? 'Names the site and lets search engines offer a search box for it.' : 'Names the site.',
    warnings: [],
    json: clean({
      '@type': 'WebSite', '@id': siteId, url: `${base}/`, name: site.name, description: site.description, publisher: { '@id': orgId }, inLanguage: 'en',
      potentialAction: site.searchPath ? { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}${site.searchPath}{search_term_string}` }, 'query-input': 'required name=search_term_string' } : undefined,
    }),
  });

  const pageType = page.kind === 'collection' || page.kind === 'category' ? 'CollectionPage' : 'WebPage';
  nodes.push({
    type: pageType,
    explanation: 'Describes this page and links it to the site.',
    warnings: page.description ? [] : ['No description: add a meta description.'],
    json: clean({ '@type': pageType, '@id': `${url}#webpage`, url, name: page.title, description: page.description, isPartOf: { '@id': siteId }, primaryImageOfPage: page.image ? { '@type': 'ImageObject', url: abs(base, page.image) } : undefined, datePublished: iso(page.datePublished), dateModified: iso(page.dateModified), inLanguage: 'en', breadcrumb: page.breadcrumbs.length > 1 ? { '@id': `${url}#breadcrumb` } : undefined }),
  });

  if (page.breadcrumbs.length > 1) {
    nodes.push({
      type: 'BreadcrumbList',
      explanation: 'Shows where the page sits on the site, in the search result.',
      warnings: [],
      json: { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: page.breadcrumbs.map((c, i) => clean({ '@type': 'ListItem', position: i + 1, name: c.name, item: i === page.breadcrumbs.length - 1 ? undefined : abs(base, c.path) })) },
    });
  }

  const article = (type: 'BlogPosting' | 'Article', explanation: string) => {
    const warnings = [...(!page.image ? ['No image: articles need one to appear as rich results.'] : []), ...(!page.datePublished ? ['No publish date.'] : [])];
    nodes.push({
      type,
      explanation,
      warnings,
      json: clean({
        '@type': type, '@id': `${url}#article`, headline: page.title.slice(0, 110), description: page.description, image: page.image ? [abs(base, page.image)] : undefined,
        datePublished: iso(page.datePublished), dateModified: iso(page.dateModified ?? page.datePublished),
        author: page.author ? { '@type': 'Person', name: page.author.name, url: abs(base, page.author.path) } : { '@id': orgId },
        publisher: { '@id': orgId }, mainEntityOfPage: { '@id': `${url}#webpage` }, articleSection: page.section, keywords: page.keywords?.join(', '), inLanguage: 'en',
      }),
    });
  };
  if (page.kind === 'post') article('BlogPosting', 'Marks this as a blog post with its author and dates.');
  if (page.kind === 'caseStudy') article('Article', 'Marks this case study as an article.');
  if (page.kind === 'project') {
    nodes.push({ type: 'CreativeWork', explanation: 'Describes this portfolio project.', warnings: page.image ? [] : ['No image for this project.'], json: clean({ '@type': 'CreativeWork', '@id': `${url}#work`, name: page.title, description: page.description, image: abs(base, page.image), url, creator: { '@id': orgId }, keywords: page.keywords?.join(', ') }) });
  }
  if (page.kind === 'app') {
    nodes.push({ type: 'SoftwareApplication', explanation: 'Describes your app so it can show as software in results.', warnings: ['Software rich results also need a price or ratings. This node still helps search engines understand the app.'], json: clean({ '@type': 'SoftwareApplication', '@id': `${url}#app`, name: page.title, description: page.description, image: abs(base, page.image), url: page.appUrl ?? url, applicationCategory: 'BusinessApplication', operatingSystem: 'Web', publisher: { '@id': orgId } }) });
  }

  if (page.offers?.length) {
    const byService = new Map<string, NonNullable<PageContext['offers']>>();
    for (const o of page.offers) byService.set(o.service, [...(byService.get(o.service) ?? []), o]);
    for (const [name, list] of byService) {
      nodes.push({
        type: 'Service',
        explanation: `Lists the prices of ${name} so search engines can show them.`,
        warnings: [],
        json: clean({ '@type': 'Service', name, provider: { '@id': orgId }, areaServed: site.business.areaServed, offers: list.map((o) => clean({ '@type': 'Offer', name: o.name, description: o.description, price: o.price, priceCurrency: o.currency, url: abs(base, o.url), availability: 'https://schema.org/InStock' })) }),
      });
    }
  }

  if (page.faq.length) {
    nodes.push({
      type: 'FAQPage',
      explanation: 'Lists the questions and answers on this page.',
      warnings: page.faq.length < 2 ? ['Only one question: add more for a useful FAQ.'] : [],
      json: { '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: page.faq.slice(0, 50).map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
    });
  }

  // Extra type chosen in the Schema tab.
  const chosen = String(page.seo.schemaType ?? 'auto');
  const s = (page.seo.schema ?? {}) as Record<string, unknown>;
  const n = String(s.name || page.title);
  if (chosen === 'HowTo') {
    const steps = Array.isArray(s.steps) ? (s.steps as { name?: string; text?: string }[]) : [];
    nodes.push({ type: 'HowTo', explanation: 'Step-by-step instructions.', warnings: steps.length < 2 ? ['Add at least two steps.'] : [], json: clean({ '@type': 'HowTo', name: n, description: page.description, image: abs(base, page.image), step: steps.map((st, i) => clean({ '@type': 'HowToStep', position: i + 1, name: st.name, text: st.text || st.name })) }) });
  } else if (chosen === 'Event') {
    const online = typeof s.location === 'string' && /^https?:\/\//.test(s.location);
    nodes.push({
      type: 'Event', explanation: 'An event with a date and place.',
      warnings: [...(!s.startDate ? ['Add a start date.'] : []), ...(!s.location ? ['Add a place or an online link.'] : [])],
      json: clean({ '@type': 'Event', name: n, description: page.description, image: abs(base, page.image), startDate: iso(s.startDate), endDate: iso(s.endDate), eventAttendanceMode: online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode', location: s.location ? (online ? { '@type': 'VirtualLocation', url: s.location } : { '@type': 'Place', name: s.location, address: s.location }) : undefined, organizer: { '@id': orgId } }),
    });
  } else if (chosen === 'Course') {
    nodes.push({ type: 'Course', explanation: 'A course and who provides it.', warnings: page.description ? [] : ['Courses need a description.'], json: clean({ '@type': 'Course', name: n, description: page.description, provider: s.provider ? { '@type': 'Organization', name: s.provider } : { '@id': orgId } }) });
  } else if (chosen === 'VideoObject') {
    nodes.push({ type: 'VideoObject', explanation: 'A video with its thumbnail and date.', warnings: [...(!page.image ? ['Videos need a thumbnail image (share image or cover).'] : []), ...(!s.uploadDate ? ['Add the upload date.'] : [])], json: clean({ '@type': 'VideoObject', name: n, description: page.description || n, thumbnailUrl: abs(base, page.image), uploadDate: iso(s.uploadDate), contentUrl: s.videoUrl, embedUrl: s.videoUrl }) });
  }
  return nodes;
}

export function graphJson(nodes: SchemaNode[]): string {
  // Escaped so the JSON can never close the script element.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes.map((n) => n.json) }).replace(/</g, '\\u003c');
}
