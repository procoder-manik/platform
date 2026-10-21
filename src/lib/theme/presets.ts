/**
 * Theme presets. Applying a preset changes design tokens only, never content.
 * Each colour has a light and a dark value. These hex values are data, not component styling.
 */
export const COLOR_TOKENS = ['primary', 'primaryInk', 'secondary', 'accent', 'success', 'warning', 'danger', 'base', 'surface', 'raised', 'line', 'ink', 'body', 'muted'] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Palette = Record<ColorToken, string>;

export interface Preset {
  id: string;
  label: string;
  description: string;
  light: Palette;
  dark: Palette;
  fonts: { display: string; body: string; mono: string };
  shape: { radiusCard: number; radiusButton: number; radiusInput: number; shadow: 'none' | 'soft' | 'glow' };
  buttons: 'solid' | 'outline' | 'soft';
  headingScale: number;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Deep navy and signal blue, the original look.',
    light: { primary: '#1d5bd8', primaryInk: '#ffffff', secondary: '#0e2a5c', accent: '#f2a93b', success: '#1f7a45', warning: '#9a5b00', danger: '#c2362b', base: '#f5f7fb', surface: '#ffffff', raised: '#eef2f9', line: '#d6deec', ink: '#0b1a33', body: '#2b3a55', muted: '#56637c' },
    dark: { primary: '#5b93ff', primaryInk: '#04122b', secondary: '#9db8ea', accent: '#f6bd5f', success: '#46c47c', warning: '#f0a33a', danger: '#ff7a6e', base: '#07142b', surface: '#0c1d3b', raised: '#12284d', line: '#22406f', ink: '#eef3fc', body: '#c5d2ea', muted: '#95a7c8' },
    fonts: { display: 'space-grotesk', body: 'inter', mono: 'jetbrains-mono' },
    shape: { radiusCard: 14, radiusButton: 10, radiusInput: 8, shadow: 'soft' },
    buttons: 'solid',
    headingScale: 1.25,
  },
  {
    id: 'clean',
    label: 'Clean',
    description: 'White, black and one accent. Quiet and sharp.',
    light: { primary: '#111111', primaryInk: '#ffffff', secondary: '#3a3a3a', accent: '#0a7cff', success: '#13804a', warning: '#946000', danger: '#c62828', base: '#ffffff', surface: '#ffffff', raised: '#f4f4f5', line: '#e4e4e7', ink: '#09090b', body: '#27272a', muted: '#5f5f69' },
    dark: { primary: '#fafafa', primaryInk: '#09090b', secondary: '#d4d4d8', accent: '#4ea1ff', success: '#4ade80', warning: '#fbbf24', danger: '#f87171', base: '#09090b', surface: '#111113', raised: '#1c1c1f', line: '#2e2e33', ink: '#fafafa', body: '#d4d4d8', muted: '#a1a1aa' },
    fonts: { display: 'inter', body: 'inter', mono: 'jetbrains-mono' },
    shape: { radiusCard: 8, radiusButton: 6, radiusInput: 6, shadow: 'none' },
    buttons: 'solid',
    headingScale: 1.2,
  },
  {
    id: 'warm',
    label: 'Warm',
    description: 'Cream and terracotta with a friendly serif.',
    light: { primary: '#b4532a', primaryInk: '#ffffff', secondary: '#5c3a21', accent: '#3f7d6e', success: '#2f7a4b', warning: '#8f5a00', danger: '#b3261e', base: '#faf5ec', surface: '#fffdf8', raised: '#f3eadb', line: '#e4d6bf', ink: '#2a1a10', body: '#4a3526', muted: '#6e5a49' },
    dark: { primary: '#e48a5f', primaryInk: '#22120a', secondary: '#e3c7a8', accent: '#7cc3b2', success: '#7fd19b', warning: '#f2b45a', danger: '#ff8a80', base: '#1b120c', surface: '#251912', raised: '#30221a', line: '#4a3628', ink: '#fbf2e6', body: '#e6d5c2', muted: '#b9a28c' },
    fonts: { display: 'fraunces', body: 'source-sans-3', mono: 'jetbrains-mono' },
    shape: { radiusCard: 18, radiusButton: 999, radiusInput: 10, shadow: 'soft' },
    buttons: 'solid',
    headingScale: 1.25,
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'High contrast and large type that stands out.',
    light: { primary: '#5b21b6', primaryInk: '#ffffff', secondary: '#111827', accent: '#e11d48', success: '#15803d', warning: '#a16207', danger: '#be123c', base: '#ffffff', surface: '#ffffff', raised: '#f3f0ff', line: '#111827', ink: '#030712', body: '#111827', muted: '#4b5563' },
    dark: { primary: '#a78bfa', primaryInk: '#13072e', secondary: '#f9fafb', accent: '#fb7185', success: '#4ade80', warning: '#facc15', danger: '#fb7185', base: '#030712', surface: '#0b0f1a', raised: '#1a1530', line: '#f9fafb', ink: '#ffffff', body: '#e5e7eb', muted: '#a7aebb' },
    fonts: { display: 'playfair-display', body: 'dm-sans', mono: 'jetbrains-mono' },
    shape: { radiusCard: 0, radiusButton: 0, radiusInput: 0, shadow: 'none' },
    buttons: 'solid',
    headingScale: 1.333,
  },
  {
    id: 'calm',
    label: 'Calm',
    description: 'Soft greens and plenty of space.',
    light: { primary: '#2f6b53', primaryInk: '#ffffff', secondary: '#24453a', accent: '#c9853a', success: '#2f7a4b', warning: '#8f5a00', danger: '#b3261e', base: '#f4f8f5', surface: '#ffffff', raised: '#e8f1ec', line: '#cfe0d6', ink: '#13281f', body: '#2f4a3f', muted: '#5a7266' },
    dark: { primary: '#7cc7a6', primaryInk: '#0b1f17', secondary: '#bfe0d1', accent: '#e8b06f', success: '#7fd19b', warning: '#f2b45a', danger: '#ff8a80', base: '#0c1712', surface: '#122019', raised: '#1a2c23', line: '#2c4639', ink: '#eef7f2', body: '#cfe3d8', muted: '#9fb9ac' },
    fonts: { display: 'manrope', body: 'manrope', mono: 'jetbrains-mono' },
    shape: { radiusCard: 20, radiusButton: 12, radiusInput: 10, shadow: 'soft' },
    buttons: 'soft',
    headingScale: 1.2,
  },
];

export function getPreset(id: string | null | undefined): Preset {
  return PRESETS.find((p) => p.id === id) ?? (PRESETS[0] as Preset);
}

/** WCAG relative luminance contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const v = parseInt(full.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** Text and background pairs that must pass WCAG AA (4.5:1 for body text, 3:1 for large text and controls). */
export const CONTRAST_PAIRS: readonly { fg: ColorToken; bg: ColorToken; label: string; min: number }[] = [
  { fg: 'ink', bg: 'base', label: 'Headings on the page', min: 4.5 },
  { fg: 'body', bg: 'base', label: 'Body text on the page', min: 4.5 },
  { fg: 'body', bg: 'surface', label: 'Body text on cards', min: 4.5 },
  { fg: 'muted', bg: 'surface', label: 'Muted text on cards', min: 4.5 },
  { fg: 'primaryInk', bg: 'primary', label: 'Button text', min: 4.5 },
  { fg: 'primary', bg: 'base', label: 'Links on the page', min: 4.5 },
];
