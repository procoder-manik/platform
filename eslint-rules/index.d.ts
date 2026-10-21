import type { Rule } from 'eslint';

declare const plugin: {
  meta: { name: string };
  rules: Record<'no-raw-colors' | 'no-hardcoded-fonts', Rule.RuleModule>;
};
export default plugin;
