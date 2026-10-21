import { describe, expect, it } from 'vitest';
import { brandSettings } from '@/lib/theme/brand';
import { buildTheme, cleanCss, headingSizes } from '@/lib/theme/css';
import { CONTRAST_PAIRS, PRESETS, contrastRatio } from '@/lib/theme/presets';
import { fontStack } from '@/lib/theme/font-catalog';

const brand = (patch: Partial<typeof brandSettings.defaults> = {}) => ({ ...brandSettings.defaults, ...patch });

describe('presets', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s passes WCAG AA in light and dark mode', (_id, preset) => {
    for (const palette of [preset.light, preset.dark]) {
      for (const pair of CONTRAST_PAIRS) {
        expect(contrastRatio(palette[pair.fg], palette[pair.bg]), `${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(pair.min);
      }
    }
  });
  it('computes contrast like WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});

describe('buildTheme', () => {
  it('uses the preset, then owner overrides, and ignores invalid colours', () => {
    const out = buildTheme(brand({ preset: 'warm', light: { primary: '#123456', accent: 'red' } }));
    expect(out.css).toContain('--primary:#123456');
    expect(out.css).toContain(`--accent:${PRESETS.find((p) => p.id === 'warm')?.light.accent}`);
    expect(out.css).not.toContain('red');
  });
  it('writes dark values under the dark selector', () => {
    const out = buildTheme(brand({ dark: { base: '#000000' } }));
    expect(out.css).toMatch(/html\[data-theme='dark'\]\{[^}]*--base:#000000/);
  });
  it('changes every token when the preset changes', () => {
    const a = buildTheme(brand({ preset: 'blueprint' })).css;
    const b = buildTheme(brand({ preset: 'bold' })).css;
    expect(a).not.toBe(b);
    expect(b).toContain('--r-card:0px');
    expect(b).toContain('var(--font-playfair-display)');
  });
  it('maps button shape and style', () => {
    expect(buildTheme(brand({ buttonShape: 'pill' })).css).toContain('--r-button:999px');
    expect(buildTheme(brand({ buttonStyle: 'outline' })).buttons).toBe('outline');
    expect(buildTheme(brand({ animations: false })).motion).toBe('off');
  });
  it('keeps the heading ladder in order on phones and desktops', () => {
    const sizes = headingSizes(brand(), 1.25);
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
    for (let i = 1; i < levels.length; i += 1) {
      expect(sizes[levels[i - 1]!].desktop).toBeGreaterThan(sizes[levels[i]!].desktop);
      expect(sizes[levels[i - 1]!].phone).toBeGreaterThanOrEqual(sizes[levels[i]!].phone);
      expect(sizes[levels[i]!].phone).toBeLessThanOrEqual(sizes[levels[i]!].desktop);
    }
  });
  it('cannot break out of the style element through custom CSS', () => {
    const css = cleanCss('a{color:red}</style><script>alert(1)</script>@import url(x);');
    expect(css).not.toMatch(/<\/style|@import/i);
  });
  it('adds a Bengali fallback to text fonts', () => {
    expect(fontStack('inter', 'sans')).toContain('--font-noto-sans-bengali');
    expect(fontStack(null, 'mono')).not.toContain('bengali');
  });
});
