import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';
import type { FieldDef } from '@/lib/admin/fields';
import { FONT_CHOICES } from './font-catalog';
import { COLOR_TOKENS, PRESETS, type ColorToken } from './presets';

const COLOR_LABELS: Record<ColorToken, string> = {
  primary: 'Primary', primaryInk: 'Text on primary', secondary: 'Secondary', accent: 'Accent', success: 'Success', warning: 'Warning', danger: 'Danger',
  base: 'Page background', surface: 'Card background', raised: 'Raised background', line: 'Lines and borders', ink: 'Headings', body: 'Body text', muted: 'Muted text',
};
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type HeadingLevel = (typeof HEADINGS)[number];

const hex = z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).nullable();
const px = (min: number, max: number) => z.number().min(min).max(max).nullable();
const media = z.string().max(2000).nullable();

const schema = z.object({
  preset: z.enum(PRESETS.map((p) => p.id) as [string, ...string[]]),
  logoLight: media, logoDark: media, logoMark: media, favicon: media, shareImage: media, adminLogo: media,
  poweredBy: z.boolean(),
  light: z.record(z.string(), hex),
  dark: z.record(z.string(), hex),
  fontDisplay: z.string().max(40).nullable(),
  fontBody: z.string().max(40).nullable(),
  fontMono: z.string().max(40).nullable(),
  baseSize: z.number().min(14).max(20),
  headingScale: z.number().min(1.1).max(1.5).nullable(),
  headings: z.record(z.string(), z.object({ phone: px(12, 72), desktop: px(12, 96) }).partial()),
  letterSpacing: z.enum(['tight', 'normal', 'wide']),
  radiusCard: px(0, 40), radiusButton: px(0, 999), radiusInput: px(0, 24),
  borderWidth: z.number().min(0).max(4),
  shadow: z.enum(['', 'none', 'soft', 'glow']).nullable(),
  container: z.number().min(880).max(1600),
  animations: z.boolean(),
  speed: z.enum(['slow', 'normal', 'fast']),
  reveal: z.boolean(),
  buttonStyle: z.enum(['', 'solid', 'outline', 'soft']).nullable(),
  buttonShape: z.enum(['', 'rounded', 'pill', 'square']).nullable(),
  mode: z.enum(['system', 'light', 'dark']),
  modeToggle: z.boolean(),
  customCss: z.string().max(50_000),
});

export type BrandSettings = z.infer<typeof schema>;

const colorFields = (mode: 'light' | 'dark'): FieldDef[] =>
  COLOR_TOKENS.map((token) => ({
    name: `${mode}.${token}`,
    label: `${COLOR_LABELS[token]}${mode === 'dark' ? ' (dark)' : ''}`,
    type: 'color',
    tab: mode === 'light' ? 'Colours' : 'Dark mode',
    width: 'half',
    info: `Leave empty to use the preset value. ${mode === 'dark' ? 'Used when the site is in dark mode.' : 'Used in light mode.'}`,
  }));

const headingFields: FieldDef[] = HEADINGS.flatMap((h) => [
  { name: `headings.${h}.phone`, label: `${h.toUpperCase()} on phones (px)`, type: 'number', min: 12, max: 72, tab: 'Typography', width: 'half', info: 'Leave empty to work it out from the base size and the heading scale.' },
  { name: `headings.${h}.desktop`, label: `${h.toUpperCase()} on desktops (px)`, type: 'number', min: 12, max: 96, tab: 'Typography', width: 'half', info: 'Sizes grow smoothly between phone and desktop widths. Keep each level smaller than the one above.' },
]);

const fontOptions = [{ value: '', label: 'Preset font' }, ...FONT_CHOICES.map((f) => ({ value: f.id, label: `${f.label} (${f.kind})` }))];

export const brandSettings = defineSettings<BrandSettings>({
  key: 'brand',
  label: 'Brand',
  description: 'Logo, colours, fonts and shapes. Every page, email and the admin use these. Rebranding never needs code.',
  area: 'design',
  module: 'core',
  schema,
  defaults: {
    preset: 'blueprint',
    logoLight: null, logoDark: null, logoMark: null, favicon: null, shareImage: null, adminLogo: null,
    poweredBy: false,
    light: {}, dark: {},
    fontDisplay: null, fontBody: null, fontMono: null,
    baseSize: 16, headingScale: null, headings: {}, letterSpacing: 'normal',
    radiusCard: null, radiusButton: null, radiusInput: null, borderWidth: 1, shadow: '', container: 1152,
    animations: true, speed: 'normal', reveal: true,
    buttonStyle: '', buttonShape: '',
    mode: 'system', modeToggle: true,
    customCss: '',
  },
  fields: [
    { name: 'preset', label: 'Preset', type: 'select', required: true, tab: 'Identity', options: PRESETS.map((p) => ({ value: p.id, label: `${p.label}: ${p.description}` })), info: 'A starting look. Colours, fonts and shapes below override it; empty fields follow the preset.' },
    { name: 'logoLight', label: 'Logo', type: 'image', tab: 'Identity', width: 'half', info: 'Shown in the header on light backgrounds. SVG or a wide PNG works best. Without a logo the site name is shown.' },
    { name: 'logoDark', label: 'Logo for dark mode', type: 'image', tab: 'Identity', width: 'half', info: 'Shown in dark mode. Leave empty to use the main logo.' },
    { name: 'logoMark', label: 'Logo mark', type: 'image', tab: 'Identity', width: 'half', info: 'A small square version, used where space is tight.' },
    { name: 'favicon', label: 'Browser icon', type: 'image', tab: 'Identity', width: 'half', info: 'The small icon in browser tabs. A square PNG of at least 512 by 512 pixels.' },
    { name: 'shareImage', label: 'Social share image', type: 'image', tab: 'Identity', width: 'half', info: 'Shown when a page without its own image is shared. 1200 by 630 pixels works best.' },
    { name: 'adminLogo', label: 'Admin logo', type: 'image', tab: 'Identity', width: 'half', info: 'Shown at the top of the admin menu. Leave empty to use the site name.' },
    { name: 'poweredBy', label: 'Show "Powered by" line', type: 'switch', tab: 'Identity', info: 'Adds a small credit line to the footer and the admin.' },
    ...colorFields('light'),
    ...colorFields('dark'),
    { name: 'fontDisplay', label: 'Heading font', type: 'select', options: fontOptions, tab: 'Typography', width: 'half', info: 'Used for headings. Fonts are stored on your own site, so nothing loads from Google.' },
    { name: 'fontBody', label: 'Body font', type: 'select', options: fontOptions, tab: 'Typography', width: 'half', info: 'Used for paragraphs, menus and buttons. Bengali text falls back to Noto Sans Bengali.' },
    { name: 'fontMono', label: 'Code font', type: 'select', options: fontOptions, tab: 'Typography', width: 'half', info: 'Used for code and small technical labels.' },
    { name: 'baseSize', label: 'Base text size (px)', type: 'number', min: 14, max: 20, required: true, tab: 'Typography', width: 'half', info: 'The size of body text. 16 is the comfortable default; 17 or 18 suits reading-heavy sites.' },
    { name: 'headingScale', label: 'Heading scale', type: 'number', min: 1.1, max: 1.5, tab: 'Typography', width: 'half', info: 'How much bigger each heading level is than the one below, for example 1.25. Leave empty to use the preset.' },
    { name: 'letterSpacing', label: 'Letter spacing', type: 'segmented', required: true, tab: 'Typography', options: [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }], info: 'Spacing between letters in headings.' },
    ...headingFields,
    { name: 'radiusCard', label: 'Card corners (px)', type: 'number', min: 0, max: 40, tab: 'Shape', width: 'half', info: 'Roundness of cards and sections. Empty uses the preset.' },
    { name: 'radiusInput', label: 'Input corners (px)', type: 'number', min: 0, max: 24, tab: 'Shape', width: 'half', info: 'Roundness of form fields. Empty uses the preset.' },
    { name: 'radiusButton', label: 'Button corners (px)', type: 'number', min: 0, max: 999, tab: 'Shape', width: 'half', info: 'Roundness of buttons. The button shape setting below overrides this.' },
    { name: 'borderWidth', label: 'Border width (px)', type: 'number', min: 0, max: 4, required: true, tab: 'Shape', width: 'half', info: 'Thickness of card and input borders.' },
    { name: 'shadow', label: 'Shadows', type: 'segmented', tab: 'Shape', options: [{ value: '', label: 'Preset' }, { value: 'none', label: 'None' }, { value: 'soft', label: 'Soft' }, { value: 'glow', label: 'Glow' }], info: 'The shadow under cards.' },
    { name: 'container', label: 'Content width (px)', type: 'number', min: 880, max: 1600, required: true, tab: 'Shape', width: 'half', info: 'The widest that page content gets on large screens. 1152 is a good default.' },
    { name: 'buttonStyle', label: 'Button style', type: 'segmented', tab: 'Buttons', options: [{ value: '', label: 'Preset' }, { value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }, { value: 'soft', label: 'Soft' }], info: 'How main buttons are filled.' },
    { name: 'buttonShape', label: 'Button shape', type: 'segmented', tab: 'Buttons', options: [{ value: '', label: 'Use corner setting' }, { value: 'rounded', label: 'Rounded' }, { value: 'pill', label: 'Pill' }, { value: 'square', label: 'Square' }], info: 'Overrides the button corner setting.' },
    { name: 'animations', label: 'Animations', type: 'switch', tab: 'Motion', info: 'Gentle movement when sections appear and on hover. Always off for visitors who ask their device for reduced motion.' },
    { name: 'speed', label: 'Animation speed', type: 'segmented', required: true, tab: 'Motion', options: [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }], info: 'How quickly animations play.' },
    { name: 'reveal', label: 'Reveal sections on scroll', type: 'switch', tab: 'Motion', info: 'Sections with an animation fade in as they scroll into view.' },
    { name: 'mode', label: 'Default colour mode', type: 'segmented', required: true, tab: 'Mode', options: [{ value: 'system', label: 'Follow the device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], info: 'The mode a first-time visitor sees.' },
    { name: 'modeToggle', label: 'Visitors can switch mode', type: 'switch', tab: 'Mode', info: 'Shows a light and dark switch in the header. The choice is remembered on their device.' },
    { name: 'customCss', label: 'Custom CSS', type: 'code', language: 'css', adminOnly: true, tab: 'Custom CSS', maxLength: 50_000, info: 'Extra CSS for the whole site. Only administrators can see this. Prefer the settings above; custom CSS can break after updates.' },
  ],
});
