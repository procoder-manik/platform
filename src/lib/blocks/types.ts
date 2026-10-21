/**
 * Page blocks. A page is an ordered list of blocks stored as JSON. Block definitions are plain data
 * (fields, defaults, meta) so the builder, tests and docs can read them; server renderers live in
 * src/components/site/blocks. Style values are token names, never raw CSS, so every block follows the brand.
 */
import type { FieldDef } from '@/lib/admin/fields';

export const SPACING = ['none', 'sm', 'md', 'lg', 'xl'] as const;
export const BACKGROUNDS = ['none', 'base', 'surface', 'raised', 'primary', 'secondary', 'ink'] as const;
export const WIDTHS = ['narrow', 'shell', 'wide', 'full'] as const;
export const ANIMATIONS = ['none', 'fade-up', 'fade', 'zoom'] as const;

export interface BlockStyle {
  paddingTop?: (typeof SPACING)[number];
  paddingBottom?: (typeof SPACING)[number];
  background?: (typeof BACKGROUNDS)[number];
  width?: (typeof WIDTHS)[number];
  align?: 'left' | 'center';
  animation?: (typeof ANIMATIONS)[number];
  anchor?: string;
  hideOn?: ('mobile' | 'desktop')[];
}

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style: BlockStyle;
  hidden?: boolean;
  children?: Block[];
}

export type BlockGroup = 'Layout' | 'Hero and text' | 'Cards and lists' | 'Live content' | 'Media' | 'Conversion' | 'Advanced';

export interface BlockDef {
  type: string;
  label: string;
  group: BlockGroup;
  /** Short text in the palette. */
  description: string;
  /** Module that must be on for the block to render and appear in the palette. */
  module: string;
  fields: readonly FieldDef[];
  defaults: Record<string, unknown>;
  /** Can hold child blocks (one level deep). */
  container?: boolean;
  /** Only administrators may add or edit it. */
  adminOnly?: boolean;
  defaultStyle?: BlockStyle;
}

export function defineBlock(def: BlockDef): BlockDef {
  return def;
}

export function newBlockId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `blk_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
