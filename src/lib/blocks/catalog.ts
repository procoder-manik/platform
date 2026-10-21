import type { FieldDef } from '@/lib/admin/fields';
import { defineBlock, type BlockDef } from './types';

const t = (name: string, label: string, info: string, extra: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: 'text', info, ...extra });
const heading = t('heading', 'Heading', 'The section heading. Leave empty for none.', { maxLength: 160 });
const intro: FieldDef = { name: 'intro', label: 'Intro', type: 'textarea', maxLength: 600, info: 'A short line under the heading.' };
const markdown = (name = 'content', label = 'Text'): FieldDef => ({ name, label, type: 'textarea', maxLength: 20_000, info: 'Use blank lines between paragraphs. **bold**, *italic*, [link](/page), lists with "- " and headings with "## ".' });
const buttons: FieldDef = {
  name: 'buttons', label: 'Button', type: 'repeater', info: 'Up to three buttons.',
  fields: [
    t('label', 'Text', 'What the button says, for example "Start a project".', { required: true, maxLength: 40, width: 'half' }),
    { name: 'href', label: 'Link', type: 'url', required: true, width: 'half', info: 'A path like /contact, a section like /#pricing, or a full address.' },
    { name: 'variant', label: 'Style', type: 'segmented', options: [{ value: 'primary', label: 'Main' }, { value: 'ghost', label: 'Quiet' }], info: 'Main buttons use the primary colour.' },
  ],
};

export const CARD_TEMPLATES = [
  { value: 'service', label: 'Service card' },
  { value: 'numbered', label: 'Numbered step' },
  { value: 'image', label: 'Image card' },
  { value: 'bigNumber', label: 'Big number' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'compact', label: 'Compact row' },
  { value: 'glow', label: 'Glow card' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'price', label: 'Price card' },
  { value: 'product', label: 'Product card' },
  { value: 'team', label: 'Team card' },
  { value: 'custom', label: 'My own HTML' },
] as const;

const cardItem: FieldDef = {
  name: 'items', label: 'Card', type: 'repeater', info: 'The cards in order. Each template uses the fields that fit it and ignores the rest.',
  fields: [
    t('title', 'Title', 'Card heading, or the person’s name on testimonial and team cards.', { maxLength: 120 }),
    { name: 'body', label: 'Text', type: 'textarea', maxLength: 800, info: 'A short description, or the quote on testimonial cards.' },
    { name: 'image', label: 'Image', type: 'image', width: 'half', info: 'Used by image, editorial, product, team and testimonial cards.' },
    t('icon', 'Icon', 'An icon name, used by service and glow cards.', { type: 'icon', width: 'half' }),
    t('number', 'Big number', 'Used by big number cards, for example "120+".', { maxLength: 20, width: 'half' }),
    t('role', 'Role or caption', 'Job title on team and testimonial cards, or a small caption.', { maxLength: 120, width: 'half' }),
    t('price', 'Price', 'Shown as written, for example "$499" or "From ৳15,000".', { maxLength: 40, width: 'half' }),
    t('period', 'Price period', 'For example "per month". Leave empty for one-time prices.', { maxLength: 30, width: 'half' }),
    { name: 'features', label: 'Included', type: 'tags', info: 'What a price card includes, one item per tag.' },
    t('badge', 'Badge', 'A small label such as "Popular".', { maxLength: 24, width: 'half' }),
    { name: 'href', label: 'Link', type: 'url', width: 'half', info: 'Makes the card a link.' },
    t('linkLabel', 'Link text', 'Button text on price and product cards, for example "Choose plan".', { maxLength: 40, width: 'half' }),
  ],
};

/** Layout controls shared by every card-type block. */
export const LAYOUT_FIELDS: readonly FieldDef[] = [
  { name: 'layoutMode', label: 'Layout', type: 'segmented', tab: 'Layout', options: [{ value: 'grid', label: 'Grid' }, { value: 'carousel', label: 'Carousel' }], info: 'A grid shows every card. A carousel slides them sideways.' },
  { name: 'columns', label: 'Cards per row', type: 'segmented', tab: 'Layout', options: ['1', '2', '3', '4'].map((v) => ({ value: v, label: v })), numeric: true, info: 'On desktops. Phones always show one card per row.' },
  { name: 'autoplay', label: 'Slide automatically', type: 'switch', tab: 'Layout', showIf: { field: 'layoutMode', equals: 'carousel' }, info: 'Pauses on hover and when the visitor prefers reduced motion.' },
  { name: 'interval', label: 'Seconds between slides', type: 'number', min: 2, max: 30, tab: 'Layout', showIf: { field: 'layoutMode', equals: 'carousel' }, info: 'From 2 to 30 seconds.' },
  { name: 'arrows', label: 'Show arrows', type: 'switch', tab: 'Layout', showIf: { field: 'layoutMode', equals: 'carousel' }, info: 'Previous and next buttons.' },
  { name: 'dots', label: 'Show dots', type: 'switch', tab: 'Layout', showIf: { field: 'layoutMode', equals: 'carousel' }, info: 'One dot per card, to jump to it.' },
];
const layoutDefaults = { layoutMode: 'grid', columns: 3, autoplay: false, interval: 5, arrows: true, dots: true };

const cardsBlock = (type: string, label: string, description: string, template: string, extra: Partial<BlockDef> = {}): BlockDef =>
  defineBlock({
    type, label, group: 'Cards and lists', description, module: 'core',
    fields: [
      heading,
      intro,
      { name: 'template', label: 'Card design', type: 'select', required: true, options: CARD_TEMPLATES, info: 'How each card looks. Every design uses your brand colours and fonts.' },
      cardItem,
      { name: 'customHtml', label: 'Card HTML', type: 'code', language: 'html', adminOnly: true, showIf: { field: 'template', equals: 'custom' }, info: 'Your own card markup. Use {{title}}, {{body}}, {{image}}, {{link}} and {{price}}. Scripts are removed.' },
      { name: 'customCss', label: 'Card CSS', type: 'code', language: 'css', adminOnly: true, showIf: { field: 'template', equals: 'custom' }, info: 'Styles for your card. They only apply inside this block.' },
      ...LAYOUT_FIELDS,
    ],
    defaults: { heading: '', intro: '', template, items: [], ...layoutDefaults },
    ...extra,
  });

export const BLOCKS: readonly BlockDef[] = [
  // Layout
  defineBlock({ type: 'section', label: 'Section', group: 'Layout', container: true, module: 'core', description: 'A wrapper with its own background that holds other blocks.', fields: [heading, intro], defaults: { heading: '', intro: '' } }),
  defineBlock({ type: 'columns', label: 'Columns', group: 'Layout', container: true, module: 'core', description: 'Two to four columns side by side; they stack on phones.', fields: [{ name: 'count', label: 'Columns', type: 'segmented', numeric: true, options: ['2', '3', '4'].map((v) => ({ value: v, label: v })), info: 'How many columns on desktops. Each block inside fills one column.' }, { name: 'gap', label: 'Gap', type: 'segmented', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], info: 'Space between columns.' }], defaults: { count: 2, gap: 'md' } }),
  defineBlock({ type: 'tabs', label: 'Tabs', group: 'Layout', module: 'core', description: 'Content in tabs; one tab shows at a time.', fields: [heading, { name: 'items', label: 'Tab', type: 'repeater', info: 'Each tab has a label and its text.', fields: [t('label', 'Tab label', 'Short text on the tab.', { required: true, maxLength: 40 }), markdown('content', 'Tab text')] }], defaults: { heading: '', items: [] } }),
  defineBlock({ type: 'accordion', label: 'Accordion', group: 'Layout', module: 'core', description: 'Questions or topics that open one at a time.', fields: [heading, { name: 'items', label: 'Item', type: 'repeater', info: 'Each item has a title and the text shown when it opens.', fields: [t('title', 'Title', 'The line people click.', { required: true, maxLength: 200 }), markdown('content', 'Text')] }], defaults: { heading: '', items: [] } }),
  defineBlock({ type: 'spacer', label: 'Spacer', group: 'Layout', module: 'core', description: 'Empty space between sections.', fields: [{ name: 'size', label: 'Size', type: 'segmented', options: ['sm', 'md', 'lg', 'xl'].map((v) => ({ value: v, label: v.toUpperCase() })), info: 'How much space.' }], defaults: { size: 'md' } }),
  defineBlock({ type: 'divider', label: 'Divider', group: 'Layout', module: 'core', description: 'A thin line between sections.', fields: [{ name: 'inset', label: 'Inset', type: 'switch', info: 'Keeps the line inside the content width.' }], defaults: { inset: true } }),

  // Hero and text
  defineBlock({
    type: 'hero', label: 'Hero', group: 'Hero and text', module: 'core', description: 'The first section of a page: heading, intro and buttons.',
    fields: [
      { name: 'variant', label: 'Layout', type: 'segmented', required: true, options: [{ value: 'text', label: 'Text' }, { value: 'image-right', label: 'Image right' }, { value: 'image-background', label: 'Image behind' }, { value: 'video', label: 'Video' }, { value: 'showcase', label: 'Showcase' }], info: 'How the hero is arranged. Showcase shows your featured projects with scrolling screenshots (needs the Portfolio module).' },
      t('heading', 'Heading', 'The main message of the page. Shown as the page’s H1.', { required: true, maxLength: 160 }),
      intro,
      buttons,
      { name: 'image', label: 'Image', type: 'image', showIf: { field: 'variant', in: ['image-right', 'image-background'] }, info: 'A wide image for "Image behind", a portrait or square one for "Image right".' },
      { name: 'video', label: 'Video address', type: 'url', showIf: { field: 'variant', equals: 'video' }, info: 'A YouTube or Vimeo link, or an MP4 file from the media library.' },
    ],
    defaults: { variant: 'text', heading: 'Replace this heading with what you do', intro: 'One or two sentences that explain who you help and how.', buttons: [{ label: 'Get in touch', href: '/contact', variant: 'primary' }] },
    defaultStyle: { paddingTop: 'xl', paddingBottom: 'lg' },
  }),
  defineBlock({ type: 'richText', label: 'Rich text', group: 'Hero and text', module: 'core', description: 'Paragraphs, lists, links and headings.', fields: [markdown()], defaults: { content: '' } }),
  defineBlock({ type: 'imageText', label: 'Image and text', group: 'Hero and text', module: 'core', description: 'An image beside a heading, text and buttons.', fields: [heading, markdown(), buttons, { name: 'image', label: 'Image', type: 'image', info: 'Shown beside the text; above it on phones.' }, { name: 'imageSide', label: 'Image side', type: 'segmented', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], info: 'Which side the image sits on.' }], defaults: { heading: '', content: '', buttons: [], imageSide: 'right' } }),
  defineBlock({ type: 'quote', label: 'Quote', group: 'Hero and text', module: 'core', description: 'One large quote with its author.', fields: [{ name: 'quote', label: 'Quote', type: 'textarea', required: true, maxLength: 600, info: 'Use real words from a real person. Do not invent quotes.' }, t('name', 'Name', 'Who said it.', { maxLength: 80, width: 'half' }), t('role', 'Role', 'Their role and company.', { maxLength: 120, width: 'half' }), { name: 'image', label: 'Photo', type: 'image', info: 'A small portrait.' }], defaults: { quote: 'Replace this with a real quote from a client.', name: '', role: '' } }),
  defineBlock({ type: 'logoStrip', label: 'Logo strip', group: 'Hero and text', module: 'core', description: 'A row of client or partner logos.', fields: [heading, { name: 'logos', label: 'Logo', type: 'repeater', info: 'Only show logos you have permission to use.', fields: [{ name: 'image', label: 'Logo', type: 'image', required: true, info: 'An SVG or a transparent PNG.' }, t('name', 'Company name', 'Read out by screen readers.', { required: true, maxLength: 80, width: 'half' }), { name: 'href', label: 'Link', type: 'url', width: 'half', info: 'Optional link to their site.' }] }], defaults: { heading: '', logos: [] } }),
  defineBlock({ type: 'stats', label: 'Stats', group: 'Hero and text', module: 'core', description: 'A few big numbers with labels.', fields: [heading, { name: 'items', label: 'Number', type: 'repeater', info: 'Use real, checkable numbers only.', fields: [t('value', 'Number', 'For example "98%" or "12 years".', { required: true, maxLength: 20, width: 'half' }), t('label', 'Label', 'What the number means.', { required: true, maxLength: 80, width: 'half' })] }], defaults: { heading: '', items: [] } }),
  defineBlock({ type: 'countdown', label: 'Countdown', group: 'Hero and text', module: 'core', description: 'Days, hours and minutes until a date.', fields: [heading, { name: 'until', label: 'Counts down to', type: 'datetime', required: true, info: 'The end date and time, in the site time zone.' }, t('doneText', 'Text after the end', 'Shown when the time is up.', { maxLength: 120 })], defaults: { heading: '', doneText: 'This has ended.' } }),

  // Cards and lists
  cardsBlock('cards', 'Cards', 'Services, features, steps, quotes or prices in any card design.', 'service'),
  cardsBlock('featureGrid', 'Feature grid', 'Features or services with icons in a grid.', 'service'),
  cardsBlock('steps', 'Steps', 'A numbered process.', 'numbered'),
  cardsBlock('team', 'Team', 'People with photo, name and role.', 'team'),
  cardsBlock('pricingTable', 'Pricing table', 'Fixed prices typed in by hand. The Services module offers live packages.', 'price'),
  defineBlock({ type: 'timeline', label: 'Timeline', group: 'Cards and lists', module: 'core', description: 'Dated events in order.', fields: [heading, { name: 'items', label: 'Event', type: 'repeater', info: 'Events in the order they happened.', fields: [t('date', 'Date', 'Shown as written, for example "2024" or "March 2025".', { required: true, maxLength: 40, width: 'half' }), t('title', 'Title', 'What happened.', { required: true, maxLength: 120, width: 'half' }), { name: 'body', label: 'Text', type: 'textarea', maxLength: 600, info: 'A sentence or two.' }] }], defaults: { heading: '', items: [] } }),
  defineBlock({ type: 'comparison', label: 'Comparison table', group: 'Cards and lists', module: 'core', description: 'Compare options side by side.', fields: [heading, { name: 'options', label: 'Options', type: 'tags', info: 'The column headings, for example your plans.' }, { name: 'rows', label: 'Row', type: 'repeater', info: 'One row per feature. Values follow the order of the options; use "yes" or "no" for ticks.', fields: [t('label', 'Feature', 'What is being compared.', { required: true, maxLength: 120 }), { name: 'values', label: 'Values', type: 'tags', info: 'One value per option, in order.' }] }], defaults: { heading: '', options: [], rows: [] } }),

  // Media
  defineBlock({ type: 'gallery', label: 'Gallery', group: 'Media', module: 'core', description: 'Images in a grid, masonry or slider.', fields: [heading, { name: 'images', label: 'Images', type: 'gallery', info: 'Pick images from the media library. Their alt text is used.' }, { name: 'style', label: 'Style', type: 'segmented', options: [{ value: 'grid', label: 'Grid' }, { value: 'masonry', label: 'Masonry' }, { value: 'slider', label: 'Slider' }], info: 'Grid crops to squares; masonry keeps each shape; slider moves sideways.' }, { name: 'columns', label: 'Per row', type: 'segmented', numeric: true, options: ['2', '3', '4'].map((v) => ({ value: v, label: v })), info: 'On desktops.' }], defaults: { heading: '', images: [], style: 'grid', columns: 3 } }),
  defineBlock({ type: 'video', label: 'Video', group: 'Media', module: 'core', description: 'A YouTube or Vimeo video, or a video file.', fields: [{ name: 'url', label: 'Video address', type: 'url', required: true, info: 'A YouTube or Vimeo link, or an MP4 or WebM file from the media library.' }, t('title', 'Title', 'Describes the video for screen readers.', { required: true, maxLength: 120 }), t('caption', 'Caption', 'Optional text under the video.', { maxLength: 200 })], defaults: { url: '', title: 'Video' } }),
  defineBlock({ type: 'map', label: 'Map', group: 'Media', module: 'core', description: 'An embedded map of your location.', fields: [{ name: 'embedUrl', label: 'Map embed address', type: 'url', required: true, info: 'In Google Maps choose Share, then Embed a map, and copy only the address inside src="...". Must start with https://www.google.com/maps/embed.', pattern: { regex: '^https://(www\\.)?google\\.com/maps/embed', message: 'Use the address from Google Maps, Share, Embed a map.' } }, t('title', 'Title', 'Describes the map for screen readers, for example "Our office in Dhaka".', { required: true, maxLength: 120 }), { name: 'height', label: 'Height (px)', type: 'number', min: 200, max: 700, info: 'Between 200 and 700.' }], defaults: { embedUrl: '', title: 'Map', height: 400 } }),

  // Conversion
  defineBlock({ type: 'cta', label: 'Call to action', group: 'Conversion', module: 'core', description: 'A heading, a line of text and buttons.', fields: [t('heading', 'Heading', 'What you want people to do next.', { required: true, maxLength: 160 }), intro, buttons], defaults: { heading: 'Ready to start?', intro: '', buttons: [{ label: 'Contact us', href: '/contact', variant: 'primary' }] }, defaultStyle: { background: 'raised', align: 'center' } }),
  defineBlock({ type: 'contactForm', label: 'Contact form', group: 'Conversion', module: 'core', description: 'Name, email and message, sent to your inbox.', fields: [heading, intro, { name: 'showPhone', label: 'Ask for a phone number', type: 'switch', info: 'Adds an optional phone field.' }, t('success', 'Thank-you message', 'Shown after sending.', { maxLength: 200 })], defaults: { heading: 'Get in touch', intro: '', showPhone: false, success: 'Thank you. We will reply soon.' } }),
  defineBlock({ type: 'bookingLink', label: 'Booking link', group: 'Conversion', module: 'core', description: 'A button to your booking page (Calendly, Cal.com and similar).', fields: [heading, intro, t('label', 'Button text', 'For example "Book a call".', { required: true, maxLength: 40, width: 'half' }), { name: 'href', label: 'Booking address', type: 'url', required: true, width: 'half', info: 'The full address of your booking page.' }], defaults: { heading: '', intro: '', label: 'Book a call', href: '' } }),
  defineBlock({ type: 'faq', label: 'FAQ', group: 'Conversion', module: 'core', description: 'Questions and answers. Search engines can show them in results.', fields: [heading, { name: 'items', label: 'Question', type: 'repeater', info: 'Real questions your customers ask.', fields: [t('question', 'Question', 'The question as a customer would ask it.', { required: true, maxLength: 200 }), markdown('answer', 'Answer')] }], defaults: { heading: 'Frequently asked questions', items: [] } }),

  // Live content: lists that update themselves from their module.
  defineBlock({ type: 'blogPosts', label: 'Blog posts', group: 'Live content', module: 'blog', description: 'The latest or featured posts, updated automatically.', fields: [heading, intro, { name: 'source', label: 'Show', type: 'segmented', options: [{ value: 'latest', label: 'Latest' }, { value: 'featured', label: 'Featured first' }], info: 'Which posts to show.' }, { name: 'count', label: 'How many', type: 'number', min: 1, max: 12, info: 'From 1 to 12.' }, { name: 'categoryId', label: 'Only this category', type: 'relation', relation: { resource: 'categories' }, info: 'Leave empty for every category.' }, ...LAYOUT_FIELDS], defaults: { heading: 'From the blog', intro: '', source: 'latest', count: 3, ...layoutDefaults } }),
  defineBlock({ type: 'portfolioGrid', label: 'Portfolio', group: 'Live content', module: 'portfolio', description: 'Projects with scrolling screenshots, updated automatically.', fields: [heading, intro, { name: 'featuredOnly', label: 'Featured projects only', type: 'switch', info: 'Shows only projects marked as featured.' }, { name: 'count', label: 'How many', type: 'number', min: 1, max: 24, info: 'From 1 to 24.' }, { name: 'columns', label: 'Per row', type: 'segmented', numeric: true, options: ['1', '2', '3'].map((v) => ({ value: v, label: v })), info: 'On desktops.' }], defaults: { heading: 'Selected work', intro: '', featuredOnly: false, count: 4, columns: 2 } }),
  defineBlock({ type: 'caseStudyList', label: 'Case studies', group: 'Live content', module: 'caseStudies', description: 'The latest case studies.', fields: [heading, intro, { name: 'count', label: 'How many', type: 'number', min: 1, max: 12, info: 'From 1 to 12.' }], defaults: { heading: 'Case studies', intro: '', count: 2 } }),
  defineBlock({ type: 'productsList', label: 'Your products', group: 'Live content', module: 'productsShowcase', description: 'Your own apps and SaaS products.', fields: [heading, intro], defaults: { heading: 'Our products', intro: '' } }),
  defineBlock({ type: 'testimonials', label: 'Testimonials', group: 'Live content', module: 'testimonials', description: 'Quotes from the testimonials library.', fields: [heading, intro, { name: 'count', label: 'How many', type: 'number', min: 1, max: 24, info: 'From 1 to 24.' }, ...LAYOUT_FIELDS], defaults: { heading: 'What clients say', intro: '', count: 6, ...layoutDefaults, layoutMode: 'carousel', columns: 2 } }),

  defineBlock({ type: 'packages', label: 'Pricing packages', group: 'Live content', module: 'services', description: 'Your services and packages with the monthly and yearly switch, updated automatically.', fields: [heading, intro, { name: 'serviceId', label: 'Only this service', type: 'relation', relation: { resource: 'services' }, info: 'Leave empty to show every service as tabs.' }], defaults: { heading: 'Pricing', intro: '', serviceId: '' } }),

  // Advanced
  defineBlock({ type: 'customHtml', label: 'Custom HTML', group: 'Advanced', module: 'core', adminOnly: true, description: 'Your own HTML and CSS. Scripts and event handlers are removed.', fields: [{ name: 'html', label: 'HTML', type: 'code', language: 'html', adminOnly: true, maxLength: 50_000, info: 'Cleaned before it is shown: scripts, event handlers and frames from unknown sites are removed.' }, { name: 'css', label: 'CSS', type: 'code', language: 'css', adminOnly: true, maxLength: 20_000, info: 'Applies only inside this block.' }], defaults: { html: '', css: '' } }),
  defineBlock({ type: 'globalSection', label: 'Global section', group: 'Advanced', module: 'core', description: 'A saved section reused on many pages. Edit it once, it changes everywhere.', fields: [{ name: 'sectionId', label: 'Saved section', type: 'relation', relation: { resource: 'global-sections' }, required: true, info: 'Pick a saved section. Edit it under Content, Global sections.' }], defaults: { sectionId: '' } }),
];

export function getBlockDef(type: string): BlockDef | undefined {
  return BLOCKS.find((b) => b.type === type);
}

export const BLOCK_GROUPS = ['Layout', 'Hero and text', 'Cards and lists', 'Live content', 'Media', 'Conversion', 'Advanced'] as const;
