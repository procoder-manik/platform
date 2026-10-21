/**
 * Fonts the owner can choose. They are self-hosted from @fontsource-variable packages through next/font/local
 * (src/lib/theme/fonts.ts), so no request goes to Google and there is no layout shift.
 * Browsers only download the fonts the theme actually uses.
 */
export interface FontChoice {
  id: string;
  label: string;
  /** CSS variable set by next/font. */
  variable: string;
  kind: 'sans' | 'serif' | 'mono';
}

export const FONT_CHOICES: readonly FontChoice[] = [
  { id: 'inter', label: 'Inter', variable: '--font-inter', kind: 'sans' },
  { id: 'manrope', label: 'Manrope', variable: '--font-manrope', kind: 'sans' },
  { id: 'dm-sans', label: 'DM Sans', variable: '--font-dm-sans', kind: 'sans' },
  { id: 'work-sans', label: 'Work Sans', variable: '--font-work-sans', kind: 'sans' },
  { id: 'space-grotesk', label: 'Space Grotesk', variable: '--font-space-grotesk', kind: 'sans' },
  { id: 'source-sans-3', label: 'Source Sans 3', variable: '--font-source-sans-3', kind: 'sans' },
  { id: 'fraunces', label: 'Fraunces', variable: '--font-fraunces', kind: 'serif' },
  { id: 'literata', label: 'Literata', variable: '--font-literata', kind: 'serif' },
  { id: 'lora', label: 'Lora', variable: '--font-lora', kind: 'serif' },
  { id: 'playfair-display', label: 'Playfair Display', variable: '--font-playfair-display', kind: 'serif' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', variable: '--font-jetbrains-mono', kind: 'mono' },
];

/** Bengali text falls back to Noto Sans Bengali after the chosen font. */
export const BENGALI_VARIABLE = '--font-noto-sans-bengali';

const FALLBACK: Record<FontChoice['kind'], string> = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
};

/** The full font-family stack for a chosen font id, or the system stack. */
export function fontStack(id: string | null | undefined, kind: FontChoice['kind']): string {
  const choice = FONT_CHOICES.find((f) => f.id === id);
  const bengali = kind === 'mono' ? '' : `var(${BENGALI_VARIABLE}), `;
  if (!choice) return `${FALLBACK[kind].replace(/, (sans-serif|serif|monospace)$/, '')}, ${bengali}${FALLBACK[kind].split(', ').pop()}`;
  return `var(${choice.variable}), ${bengali}${FALLBACK[choice.kind]}`;
}
