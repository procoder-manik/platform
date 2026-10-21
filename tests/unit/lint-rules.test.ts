import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import plugin from '../../eslint-rules/index.js';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run('no-raw-colors', plugin.rules['no-raw-colors'], {
  valid: ["const c = 'bg-primary text-ink';", "const id = '#main';", "const href = '/blog#top';"],
  invalid: [
    { code: "const c = 'bg-[#ff0000]';", errors: [{ messageId: 'raw' }] },
    { code: "const s = { color: '#123456' };", errors: [{ messageId: 'raw' }] },
    { code: 'const s = `rgb(0, 0, 0)`;', errors: [{ messageId: 'raw' }] },
  ],
});

tester.run('no-hardcoded-fonts', plugin.rules['no-hardcoded-fonts'], {
  valid: ["const c = 'font-display text-lg';"],
  invalid: [
    { code: "const s = { fontFamily: 'Inter' };", errors: [{ messageId: 'font' }] },
    { code: "const c = \"font-['Inter']\";", errors: [{ messageId: 'font' }] },
    { code: "const css = 'font-family: Arial';", errors: [{ messageId: 'font' }] },
  ],
});
