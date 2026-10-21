import localFont from 'next/font/local';

/*
 * Self-hosted variable fonts. next/font/local needs literal options (no spreads or variables), one call per font.
 * preload is off: the browser fetches a font file only when the theme uses that font.
 */
const inter = localFont({ display: 'swap', preload: false, weight: '100 900', src: '../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', variable: '--font-inter' });
const manrope = localFont({ display: 'swap', preload: false, weight: '200 800', src: '../../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2', variable: '--font-manrope' });
const dmSans = localFont({ display: 'swap', preload: false, weight: '100 900', src: '../../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', variable: '--font-dm-sans' });
const workSans = localFont({ display: 'swap', preload: false, weight: '100 900', src: '../../../node_modules/@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2', variable: '--font-work-sans' });
const spaceGrotesk = localFont({ display: 'swap', preload: false, weight: '300 700', src: '../../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2', variable: '--font-space-grotesk' });
const sourceSans = localFont({ display: 'swap', preload: false, weight: '200 900', src: '../../../node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2', variable: '--font-source-sans-3' });
const fraunces = localFont({ display: 'swap', preload: false, weight: '100 900', src: '../../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2', variable: '--font-fraunces' });
const literata = localFont({ display: 'swap', preload: false, weight: '200 900', src: '../../../node_modules/@fontsource-variable/literata/files/literata-latin-wght-normal.woff2', variable: '--font-literata' });
const lora = localFont({ display: 'swap', preload: false, weight: '400 700', src: '../../../node_modules/@fontsource-variable/lora/files/lora-latin-wght-normal.woff2', variable: '--font-lora' });
const playfair = localFont({ display: 'swap', preload: false, weight: '400 900', src: '../../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2', variable: '--font-playfair-display' });
const jetbrains = localFont({ display: 'swap', preload: false, weight: '100 800', src: '../../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', variable: '--font-jetbrains-mono' });
const bengali = localFont({ display: 'swap', preload: false, weight: '100 900', src: '../../../node_modules/@fontsource-variable/noto-sans-bengali/files/noto-sans-bengali-bengali-wght-normal.woff2', variable: '--font-noto-sans-bengali' });

/** Class names that define every font variable. Put on <html>. */
export const fontVariables = [inter, manrope, dmSans, workSans, spaceGrotesk, sourceSans, fraunces, literata, lora, playfair, jetbrains, bengali]
  .map((f) => f.variable)
  .join(' ');
