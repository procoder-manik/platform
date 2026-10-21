import type { FieldDef } from '@/lib/admin/fields';
import { ANIMATIONS, BACKGROUNDS, SPACING, WIDTHS } from './types';

const opt = (values: readonly string[], labels: Record<string, string> = {}) =>
  values.map((v) => ({ value: v, label: labels[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace('-', ' ') }));

/** Design controls every block has. They store token names only. */
export const STYLE_FIELDS: readonly FieldDef[] = [
  { name: 'paddingTop', label: 'Space above', type: 'segmented', width: 'half', options: opt(SPACING, { sm: 'S', md: 'M', lg: 'L', xl: 'XL' }), info: 'Empty space above the section.' },
  { name: 'paddingBottom', label: 'Space below', type: 'segmented', width: 'half', options: opt(SPACING, { sm: 'S', md: 'M', lg: 'L', xl: 'XL' }), info: 'Empty space below the section.' },
  { name: 'background', label: 'Background', type: 'select', width: 'half', options: opt(BACKGROUNDS, { none: 'Same as page', base: 'Page colour', surface: 'Card colour', raised: 'Raised', primary: 'Primary', secondary: 'Secondary', ink: 'Dark' }), info: 'Background colour from the brand. Text colour adjusts to stay readable.' },
  { name: 'width', label: 'Width', type: 'segmented', width: 'half', options: opt(WIDTHS, { narrow: 'Narrow', shell: 'Normal', wide: 'Wide', full: 'Full' }), info: 'How wide the content can get.' },
  { name: 'align', label: 'Alignment', type: 'segmented', width: 'half', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }], info: 'Alignment of headings and text.' },
  { name: 'animation', label: 'Entrance', type: 'select', width: 'half', options: opt(ANIMATIONS, { 'fade-up': 'Fade up' }), info: 'Plays once when the section scrolls into view, if animations are on in Brand. Never for visitors who prefer reduced motion.' },
  { name: 'anchor', label: 'Anchor', type: 'slug', width: 'half', info: 'Gives the section an id so menu links like /#pricing can jump to it.' },
  { name: 'hideOn', label: 'Hide on', type: 'multiselect', width: 'half', options: [{ value: 'mobile', label: 'Phones' }, { value: 'desktop', label: 'Desktops' }], info: 'Hide this section on some screen sizes.' },
];
