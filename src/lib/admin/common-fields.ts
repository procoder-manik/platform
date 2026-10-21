import type { FieldDef } from './fields';

export const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PUBLISHED', label: 'Published' },
];

/**
 * SEO, Social, Schema and Code tabs shared by every page-like record. Values live in the record's `seo` JSON.
 * The score and the first fixes are stored there too (seo.score, seo.fixes) when the record is saved.
 */
export const SEO_FIELDS: FieldDef[] = [
  { name: 'seo.focusKeyword', label: 'Focus keyword', type: 'text', tab: 'SEO', maxLength: 80, info: 'The main phrase people search for to find this page. The SEO score checks the page against it.' },
  { name: 'seo.keywords', label: 'Related keywords', type: 'tags', tab: 'SEO', info: 'Other phrases this page should rank for. Used for internal-link suggestions.' },
  { name: 'seo.title', label: 'Meta title', type: 'text', tab: 'SEO', maxLength: 70, info: 'The title in search results. About 50 to 60 characters works best. Leave empty to use the title.' },
  { name: 'seo.description', label: 'Meta description', type: 'textarea', tab: 'SEO', maxLength: 200, info: 'The summary under the title in search results. About 120 to 160 characters.' },
  { name: 'seo.canonical', label: 'Canonical address', type: 'url', tab: 'SEO', info: 'Only set this if the same content lives at another address that should rank instead.' },
  { name: 'seo.noindex', label: 'Hide from search engines', type: 'switch', tab: 'SEO', width: 'half', info: 'Asks search engines not to list this page, and leaves it out of the sitemap.' },
  { name: 'seo.nofollow', label: 'Do not follow links', type: 'switch', tab: 'SEO', width: 'half', info: 'Asks search engines not to follow the links on this page. Rarely needed.' },
  { name: 'seo.maxSnippet', label: 'Longest text snippet', type: 'number', min: -1, max: 1000, tab: 'SEO', width: 'half', info: 'How many characters search engines may quote. Empty or -1 means no limit.' },
  { name: 'seo.maxImagePreview', label: 'Image preview size', type: 'select', tab: 'SEO', width: 'half', options: [{ value: 'large', label: 'Large' }, { value: 'standard', label: 'Standard' }, { value: 'none', label: 'None' }], info: 'How big an image search engines may show. Large helps in Discover and image results.' },
  { name: 'seo.sitemap', label: 'Include in the sitemap', type: 'segmented', tab: 'SEO', options: [{ value: 'auto', label: 'Automatic' }, { value: 'exclude', label: 'Leave out' }], info: 'Automatic includes every live, indexable page.' },
  { name: 'seo.priority', label: 'Sitemap priority', type: 'number', min: 0, max: 1, tab: 'SEO', width: 'half', info: 'From 0 to 1. Most search engines ignore it; leave empty unless you know you need it.' },
  { name: 'seo.changefreq', label: 'Change frequency', type: 'select', tab: 'SEO', width: 'half', options: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })), info: 'How often this page changes. A hint only.' },
  { name: 'seo.ogTitle', label: 'Share title', type: 'text', tab: 'Social', maxLength: 90, info: 'The title when shared on social networks and chat apps. Empty uses the meta title.' },
  { name: 'seo.ogDescription', label: 'Share description', type: 'textarea', tab: 'Social', maxLength: 200, info: 'The text under the share title. Empty uses the meta description.' },
  { name: 'seo.ogImage', label: 'Share image', type: 'image', tab: 'Social', info: '1200 by 630 pixels. Empty uses the cover image, then an image made automatically from the title.' },
  { name: 'seo.twitterCard', label: 'Card type', type: 'segmented', tab: 'Social', options: [{ value: 'summary_large_image', label: 'Large image' }, { value: 'summary', label: 'Small image' }], info: 'How the link looks on X and similar networks.' },
  { name: 'seo.schemaType', label: 'Schema type', type: 'select', tab: 'Schema', options: [{ value: 'auto', label: 'Automatic' }, { value: 'HowTo', label: 'How-to' }, { value: 'Event', label: 'Event' }, { value: 'Course', label: 'Course' }, { value: 'VideoObject', label: 'Video' }, { value: 'none', label: 'No extra schema' }], info: 'Automatic builds the right structured data from the content. Pick a type to add its details below.' },
  { name: 'seo.schema.name', label: 'Name', type: 'text', tab: 'Schema', maxLength: 160, showIf: { field: 'seo.schemaType', in: ['HowTo', 'Event', 'Course', 'VideoObject'] }, info: 'The name of the event, course, video or how-to. Empty uses the title.' },
  { name: 'seo.schema.startDate', label: 'Starts', type: 'datetime', tab: 'Schema', width: 'half', showIf: { field: 'seo.schemaType', equals: 'Event' }, info: 'When the event starts.' },
  { name: 'seo.schema.endDate', label: 'Ends', type: 'datetime', tab: 'Schema', width: 'half', showIf: { field: 'seo.schemaType', equals: 'Event' }, info: 'When it ends.' },
  { name: 'seo.schema.location', label: 'Place or online link', type: 'text', tab: 'Schema', maxLength: 300, showIf: { field: 'seo.schemaType', equals: 'Event' }, info: 'An address, or a link for online events.' },
  { name: 'seo.schema.provider', label: 'Provider', type: 'text', tab: 'Schema', maxLength: 120, showIf: { field: 'seo.schemaType', equals: 'Course' }, info: 'Who runs the course. Empty uses the business name.' },
  { name: 'seo.schema.videoUrl', label: 'Video address', type: 'url', tab: 'Schema', showIf: { field: 'seo.schemaType', equals: 'VideoObject' }, info: 'A YouTube, Vimeo or file address.' },
  { name: 'seo.schema.uploadDate', label: 'Upload date', type: 'date', tab: 'Schema', showIf: { field: 'seo.schemaType', equals: 'VideoObject' }, info: 'When the video was published.' },
  { name: 'seo.schema.steps', label: 'Step', type: 'repeater', tab: 'Schema', showIf: { field: 'seo.schemaType', equals: 'HowTo' }, info: 'The steps of the how-to, in order.', fields: [{ name: 'name', label: 'Step', type: 'text', required: true, maxLength: 120, info: 'A short step name.' }, { name: 'text', label: 'What to do', type: 'textarea', maxLength: 600, info: 'The instruction.' }] },
  { name: 'seo.css', label: 'Page CSS', type: 'code', language: 'css', adminOnly: true, tab: 'Code', maxLength: 20_000, info: 'CSS for this page only. Prefer Brand settings; custom CSS can break after updates.' },
];

export function statusFields(withSchedule = true): FieldDef[] {
  return [
    { name: 'status', label: 'Status', type: 'segmented', options: withSchedule ? STATUS_OPTIONS : STATUS_OPTIONS.filter((o) => o.value !== 'SCHEDULED'), required: true, width: 'half', info: 'Drafts are only visible to staff through a preview link.' + (withSchedule ? ' Scheduled items go live at the publish time.' : '') },
    ...(withSchedule ? [{ name: 'publishAt', label: 'Publish at', type: 'datetime', width: 'half', showIf: { field: 'status', equals: 'SCHEDULED' }, required: true, info: 'When it goes live, in the site time zone.' } as FieldDef] : []),
  ];
}

export const slugField = (from = 'title', prefix = ''): FieldDef => ({
  name: 'slug', label: 'Address', type: 'slug', from, required: true,
  info: `The last part of the address${prefix ? `, after ${prefix}` : ''}. Changing it on a live item adds a redirect from the old address automatically.`,
});
