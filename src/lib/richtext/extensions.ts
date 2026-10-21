'use client';

import { Node, mergeAttributes } from '@tiptap/core';

/** A highlighted note inside an article. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return { tone: { default: 'info', parseHTML: (el) => el.getAttribute('data-tone') ?? 'info', renderHTML: (a) => ({ 'data-tone': a.tone as string }) } };
  },
  parseHTML() {
    return [{ tag: 'aside.rt-callout' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'rt-callout' }), 0];
  },
});

/** A call-to-action button inside an article. */
export const ArticleButton = Node.create({
  name: 'button',
  group: 'block',
  atom: true,
  addAttributes() {
    return { href: { default: '/contact' }, label: { default: 'Get in touch' } };
  },
  parseHTML() {
    return [{ tag: 'a[data-rt-button]', getAttrs: (el) => ({ href: el.getAttribute('href'), label: el.textContent }) }];
  },
  renderHTML({ node }) {
    return ['p', {}, ['a', { 'data-rt-button': '', class: 'btn btn-primary', href: String(node.attrs.href) }, String(node.attrs.label)]];
  },
});
