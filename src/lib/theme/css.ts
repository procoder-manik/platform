/**
 * Turns Brand settings into CSS variables. Pure, so it is unit tested and runs per request on the server.
 * Selectors use html:root so they win over the fallback tokens in globals.css regardless of stylesheet order.
 */
import type { BrandSettings, HeadingLevel } from './brand';
import { fontStack } from './font-catalog';
import { COLOR_TOKENS, getPreset, type Palette } from './presets';

const HEX = /^#[0-9a-fA-F]{6}$/;
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function resolvePalette(base: Palette, overrides: Record<string, string | null | undefined>): Palette {
  const out = { ...base };
  for (const token of COLOR_TOKENS) {
    const value = overrides[token];
    if (value && HEX.test(value)) out[token] = value;
  }
  return out;
}

/** Heading sizes in px: from settings, else from base size and scale. Phone sizes shrink toward the base size. */
export function headingSizes(brand: BrandSettings, scale: number): Record<HeadingLevel, { phone: number; desktop: number }> {
  const levels: HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  const out = {} as Record<HeadingLevel, { phone: number; desktop: number }>;
  levels.forEach((level, i) => {
    const auto = Math.round(brand.baseSize * scale ** (5 - i));
    const desktop = clamp(brand.headings[level]?.desktop ?? auto, 12, 96);
    const phone = clamp(brand.headings[level]?.phone ?? Math.round(brand.baseSize + (desktop - brand.baseSize) * 0.65), 12, 72);
    out[level] = { phone: Math.min(phone, desktop), desktop };
  });
  return out;
}

const SHADOWS = {
  none: 'none',
  soft: '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 24px -8px rgb(0 0 0 / 0.12)',
  glow: '0 0 0 1px var(--line), 0 12px 32px -12px color-mix(in srgb, var(--primary) 45%, transparent)',
} as const;

export interface ThemeOutput {
  css: string;
  buttons: 'solid' | 'outline' | 'soft';
  motion: 'on' | 'off';
  mode: BrandSettings['mode'];
  toggle: boolean;
}

/** Custom CSS cannot close the style element or pull in remote code. */
export function cleanCss(css: string): string {
  return css.replace(/<\/?style/gi, '').replace(/<!--|-->/g, '').replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(/gi, '');
}

export function buildTheme(brand: BrandSettings): ThemeOutput {
  const preset = getPreset(brand.preset);
  const light = resolvePalette(preset.light, brand.light);
  const dark = resolvePalette(preset.dark, brand.dark);
  const scale = brand.headingScale ?? preset.headingScale;
  const sizes = headingSizes(brand, scale);
  const buttonRadius =
    brand.buttonShape === 'pill' ? 999 : brand.buttonShape === 'square' ? 0 : brand.buttonShape === 'rounded' ? 10 : (brand.radiusButton ?? preset.shape.radiusButton);
  const fluid = (p: number, d: number) => (p === d ? `${d}px` : `clamp(${p}px, calc(${p}px + ${d - p} * ((100vw - 360px) / 920)), ${d}px)`);
  const speed = { slow: '400ms', normal: '250ms', fast: '150ms' }[brand.speed];
  const tracking = { tight: '-0.02em', normal: '-0.01em', wide: '0.01em' }[brand.letterSpacing];

  const vars: Record<string, string> = {
    '--r-card': `${clamp(brand.radiusCard ?? preset.shape.radiusCard, 0, 40)}px`,
    '--r-button': `${clamp(buttonRadius, 0, 999)}px`,
    '--r-input': `${clamp(brand.radiusInput ?? preset.shape.radiusInput, 0, 24)}px`,
    '--border-width': `${clamp(brand.borderWidth, 0, 4)}px`,
    '--container-width': `${clamp(brand.container, 880, 1600) / 16}rem`,
    '--font-display-stack': fontStack(brand.fontDisplay || preset.fonts.display, 'sans'),
    '--font-body-stack': fontStack(brand.fontBody || preset.fonts.body, 'sans'),
    '--font-mono-stack': fontStack(brand.fontMono || preset.fonts.mono, 'mono'),
    '--fs-base': `${clamp(brand.baseSize, 14, 20)}px`,
    '--heading-tracking': tracking,
    '--sh-card': SHADOWS[brand.shadow || preset.shape.shadow],
    '--motion-speed': speed,
  };
  for (const [level, size] of Object.entries(sizes)) vars[`--fs-${level}`] = fluid(size.phone, size.desktop);
  for (const token of COLOR_TOKENS) vars[`--${kebab(token)}`] = light[token];

  const darkVars = COLOR_TOKENS.map((t) => `--${kebab(t)}:${dark[t]}`).join(';');
  const lines = [
    `html:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')};color-scheme:light}`,
    `html[data-theme='dark']{${darkVars};color-scheme:dark}`,
  ];
  if (brand.customCss.trim()) lines.push(cleanCss(brand.customCss));
  return {
    css: lines.join('\n'),
    buttons: brand.buttonStyle || preset.buttons,
    motion: brand.animations ? 'on' : 'off',
    mode: brand.mode,
    toggle: brand.modeToggle,
  };
}
