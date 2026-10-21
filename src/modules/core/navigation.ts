import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

const link = z.object({ label: z.string().max(60), href: z.string().max(500) });
const menuItem = link.extend({ children: z.array(link).max(20).optional().default([]) });

const schema = z.object({
  headerLayout: z.enum(['left', 'centered', 'split']),
  sticky: z.boolean(),
  transparentOverHero: z.boolean(),
  menu: z.array(menuItem).max(12),
  buttonLabel: z.string().max(40).nullable(),
  buttonHref: z.string().max(500).nullable(),
  showAccountIcon: z.boolean(),
  showCartIcon: z.boolean(),
  mobileMenu: z.enum(['drawer', 'dropdown']),
  footerAbout: z.string().max(600).nullable(),
  footerColumns: z.array(z.object({ title: z.string().max(60), links: z.array(link).max(20).optional().default([]) })).max(6),
  social: z.array(z.object({ platform: z.string().max(30), url: z.string().max(500) })).max(12),
  footerBottom: z.string().max(300).nullable(),
  footerPages: z.boolean(),
  backToTop: z.boolean(),
  backToTopSide: z.enum(['left', 'right']),
  chatSide: z.enum(['left', 'right']),
});

export type NavigationSettings = z.infer<typeof schema>;

const linkFields = [
  { name: 'label', label: 'Label', type: 'text', required: true, maxLength: 60, width: 'half', info: 'The text people see.' },
  { name: 'href', label: 'Link', type: 'url', required: true, width: 'half', info: 'A path like /about, a section like /#pricing, or a full address.' },
] as const;

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'github', 'dribbble', 'behance', 'whatsapp', 'email'] as const;

/** Header, footer and floating buttons. Links to switched-off modules are dropped automatically. */
export const navigationSettings = defineSettings<NavigationSettings>({
  key: 'navigation',
  label: 'Header and footer',
  description: 'Menus, the header button, footer columns, social links and floating buttons.',
  area: 'design',
  module: 'core',
  schema,
  defaults: {
    headerLayout: 'left',
    sticky: true,
    transparentOverHero: false,
    menu: [
      { label: 'Home', href: '/', children: [] },
      { label: 'Contact', href: '/contact', children: [] },
    ],
    buttonLabel: null,
    buttonHref: null,
    showAccountIcon: true,
    showCartIcon: true,
    mobileMenu: 'drawer',
    footerAbout: null,
    footerColumns: [],
    social: [],
    footerBottom: null,
    footerPages: true,
    backToTop: true,
    backToTopSide: 'right',
    chatSide: 'right',
  },
  fields: [
    { name: 'headerLayout', label: 'Header layout', type: 'segmented', required: true, tab: 'Header', options: [{ value: 'left', label: 'Logo left, menu right' }, { value: 'centered', label: 'Centred' }, { value: 'split', label: 'Menu split around logo' }], info: 'Where the logo and the menu sit.' },
    { name: 'sticky', label: 'Keep header visible when scrolling', type: 'switch', tab: 'Header', width: 'half', info: 'The header stays at the top of the screen.' },
    { name: 'transparentOverHero', label: 'Transparent over the first section', type: 'switch', tab: 'Header', width: 'half', info: 'Lets a hero image show through the header on pages that start with one.' },
    {
      name: 'menu', label: 'Menu item', type: 'repeater', tab: 'Header',
      info: 'Main menu links in order. Add sub-items to make a dropdown. Links to switched-off modules are hidden.',
      fields: [...linkFields, { name: 'children', label: 'Dropdown link', type: 'repeater', fields: [...linkFields], info: 'Optional links shown under this item.' }],
    },
    { name: 'buttonLabel', label: 'Header button text', type: 'text', maxLength: 40, tab: 'Header', width: 'half', info: 'An optional call to action at the right of the header, for example "Start a project".' },
    { name: 'buttonHref', label: 'Header button link', type: 'url', tab: 'Header', width: 'half', info: 'Where the header button goes.' },
    { name: 'showAccountIcon', label: 'Show account icon', type: 'switch', tab: 'Header', width: 'half', info: 'Shown only while customer accounts are switched on.' },
    { name: 'showCartIcon', label: 'Show cart icon', type: 'switch', tab: 'Header', width: 'half', info: 'Shown only while the store is switched on.' },
    { name: 'mobileMenu', label: 'Phone menu', type: 'segmented', required: true, tab: 'Header', options: [{ value: 'drawer', label: 'Side drawer' }, { value: 'dropdown', label: 'Drop down' }], info: 'How the menu opens on phones.' },
    { name: 'footerAbout', label: 'About text', type: 'textarea', maxLength: 600, tab: 'Footer', info: 'A short line about the business, shown under the logo in the footer.' },
    {
      name: 'footerColumns', label: 'Footer column', type: 'repeater', tab: 'Footer',
      info: 'Columns of links in the footer.',
      fields: [{ name: 'title', label: 'Column title', type: 'text', required: true, maxLength: 60, info: 'The heading above the links.' }, { name: 'links', label: 'Link', type: 'repeater', fields: [...linkFields], info: 'Links in this column.' }],
    },
    {
      name: 'social', label: 'Social link', type: 'repeater', tab: 'Footer',
      info: 'Icons linking to your profiles.',
      fields: [
        { name: 'platform', label: 'Platform', type: 'select', required: true, width: 'half', options: SOCIAL_PLATFORMS.map((p) => ({ value: p, label: p === 'x' ? 'X (Twitter)' : p.charAt(0).toUpperCase() + p.slice(1) })), info: 'Which network this is.' },
        { name: 'url', label: 'Address', type: 'url', required: true, width: 'half', info: 'The full address of your profile.' },
      ],
    },
    { name: 'footerPages', label: 'List pages marked "show in footer"', type: 'switch', tab: 'Footer', info: 'Adds a column with every published page that has "Show in footer" switched on.' },
    { name: 'footerBottom', label: 'Bottom line', type: 'text', maxLength: 300, tab: 'Footer', info: 'Small text at the very bottom. The year and site name are added automatically when this is empty.' },
    { name: 'backToTop', label: 'Back to top button', type: 'switch', tab: 'Floating buttons', width: 'half', info: 'A button with a reading-progress ring that appears after scrolling down.' },
    { name: 'backToTopSide', label: 'Back to top side', type: 'segmented', required: true, tab: 'Floating buttons', width: 'half', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], info: 'When it shares a side with the chat button, it sits above it.' },
    { name: 'chatSide', label: 'Chat button side', type: 'segmented', required: true, tab: 'Floating buttons', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], info: 'Used when the chat module is on.' },
  ],
});
