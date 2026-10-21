/** Cache tags. Saving anything refreshes the matching tags so the live site updates on the next view. */
export const TAGS = {
  settings: 'settings',
  content: 'content',
  setting: (key: string) => `setting:${key}`,
  type: (id: string) => `type:${id}`,
  slug: (slug: string) => `slug:${slug}`,
  stock: (productId: string) => `stock:${productId}`,
} as const;
