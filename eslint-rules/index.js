/**
 * Local lint rules that keep components on brand tokens.
 * - platform/no-raw-colors: no hex, rgb(), hsl() or oklch() colours, and no Tailwind arbitrary colours like bg-[#fff].
 * - platform/no-hardcoded-fonts: no font-family values, fontFamily style keys or font-[...] classes.
 * Colours and fonts come from the Brand settings through CSS variables (see src/app/globals.css).
 */
const COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;
const FONT = /font-family\s*:|\bfont-\[/;

function textOf(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateElement') return node.value.raw;
  if (node.type === 'JSXText') return null;
  return null;
}

function stringRule(pattern, messageId) {
  return (context) => {
    const check = (node) => {
      const text = textOf(node);
      if (text && pattern.test(text)) context.report({ node, messageId });
    };
    return { Literal: check, TemplateElement: check };
  };
}

const noRawColors = {
  meta: {
    type: 'problem',
    docs: { description: 'Use brand colour tokens instead of raw colour values.' },
    messages: {
      raw: 'Use a colour token (for example bg-primary or text-ink) instead of a raw colour. Colours come from Admin > Brand.',
    },
    schema: [],
  },
  create: stringRule(COLOR, 'raw'),
};

const noHardcodedFonts = {
  meta: {
    type: 'problem',
    docs: { description: 'Use font tokens instead of font names.' },
    messages: {
      font: 'Use a font token (font-display, font-body or font-mono) instead of a font name. Fonts come from Admin > Brand.',
    },
    schema: [],
  },
  create(context) {
    const strings = stringRule(FONT, 'font')(context);
    return {
      ...strings,
      Property(node) {
        const key = node.key && (node.key.name ?? node.key.value);
        if (key === 'fontFamily') context.report({ node, messageId: 'font' });
      },
    };
  },
};

const plugin = {
  meta: { name: 'eslint-plugin-platform' },
  rules: { 'no-raw-colors': noRawColors, 'no-hardcoded-fonts': noHardcodedFonts },
};

export default plugin;
