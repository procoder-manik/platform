'use client';

import { CONTRAST_PAIRS, COLOR_TOKENS, PRESETS, contrastRatio, getPreset, type Palette } from '@/lib/theme/presets';
import { resolvePalette } from '@/lib/theme/css';
import { Button } from '../ui';

interface Props {
  values: Record<string, unknown>;
  onApplyPreset: (id: string) => void;
}

/** Brand screen helpers: one-click presets and a live contrast check for light and dark mode. */
export function BrandPanel({ values, onApplyPreset }: Props) {
  const preset = getPreset(String(values.preset ?? 'blueprint'));
  const light = resolvePalette(preset.light, (values.light ?? {}) as Record<string, string | null>);
  const dark = resolvePalette(preset.dark, (values.dark ?? {}) as Record<string, string | null>);
  const checks = (palette: Palette) => CONTRAST_PAIRS.map((pair) => ({ ...pair, ratio: contrastRatio(palette[pair.fg], palette[pair.bg]) }));

  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby="presets-title" className="rounded-card border border-line bg-surface p-4">
        <h2 id="presets-title" className="font-display text-base font-semibold text-ink">Presets</h2>
        <p className="mt-1 text-sm">Applying a preset resets colours, fonts and shapes to it. Your content does not change.</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {PRESETS.map((p) => (
            <li key={p.id} className={`rounded-card border p-3 ${p.id === preset.id ? 'border-primary' : 'border-line'}`}>
              <div className="flex gap-1" aria-hidden="true">
                {(['base', 'surface', 'primary', 'accent', 'ink'] as const).map((t) => (
                  // The swatches show preset colours as data.
                  <span key={t} className="h-6 flex-1 rounded border border-line" style={{ background: p.light[t] }} />
                ))}
              </div>
              <p className="mt-2 text-sm font-medium text-ink">{p.label}</p>
              <p className="text-xs text-muted">{p.description}</p>
              <Button className="mt-2 w-full" variant={p.id === preset.id ? 'ghost' : 'secondary'} onClick={() => onApplyPreset(p.id)}>
                {p.id === preset.id ? 'Reset to this preset' : 'Apply'}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="contrast-title" className="rounded-card border border-line bg-surface p-4">
        <h2 id="contrast-title" className="font-display text-base font-semibold text-ink">Contrast check</h2>
        <p className="mt-1 text-sm">Text must reach 4.5 to 1 against its background to pass WCAG AA. Updates as you change colours.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(['light', 'dark'] as const).map((mode) => (
            <table key={mode} className="w-full text-left text-sm">
              <caption className="pb-1 text-left font-medium text-ink">{mode === 'light' ? 'Light mode' : 'Dark mode'}</caption>
              <tbody>
                {checks(mode === 'light' ? light : dark).map((c) => (
                  <tr key={c.label} className="border-t border-line">
                    <td className="py-1.5">{c.label}</td>
                    <td className="py-1.5 tabular-nums">{c.ratio.toFixed(2)}</td>
                    <td className={`py-1.5 font-medium ${c.ratio >= c.min ? 'text-success' : 'text-danger'}`}>{c.ratio >= c.min ? 'Pass' : 'Fail'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>
    </div>
  );
}

/** The values a preset reset clears, so empty fields follow the preset again. */
export function presetReset(id: string): Record<string, unknown> {
  return {
    preset: id,
    light: Object.fromEntries(COLOR_TOKENS.map((t) => [t, null])),
    dark: Object.fromEntries(COLOR_TOKENS.map((t) => [t, null])),
    fontDisplay: null, fontBody: null, fontMono: null, headingScale: null, headings: {},
    radiusCard: null, radiusButton: null, radiusInput: null, shadow: '', buttonStyle: '', buttonShape: '',
  };
}
