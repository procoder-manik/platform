import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import platform from './eslint-rules/index.js';

// The long dash, built from its code so this file does not trip its own rule.
const LONG_DASH = String.fromCharCode(0x2014);

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/generated/**', 'coverage/**', 'playwright-report/**']),
  {
    // Components and pages may only use brand tokens.
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'src/modules/**/components/**/*.{ts,tsx}'],
    plugins: { platform },
    rules: {
      'platform/no-raw-colors': 'error',
      'platform/no-hardcoded-fonts': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${LONG_DASH}/]`, message: 'No long dashes in text. Use a comma, colon or full stop.' },
        { selector: `JSXText[value=/${LONG_DASH}/]`, message: 'No long dashes in text. Use a comma, colon or full stop.' },
      ],
    },
  },
]);
