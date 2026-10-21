import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings/store';
import { storeSettings } from '@/lib/store/settings';
import { stockState, type StockState } from '@/lib/store/logic';

export interface ShopVariant {
  id: string;
  key: string;
  label: string;
  price: number;
  stock: number;
  image: string | null;
  sku: string | null;
}
export interface ShopProduct {
  id: string;
  name: string;
  slug: string;
  kind: string;
  summary: string | null;
  bodyHtml: string | null;
  images: string[];
  price: number;
  comparePrice: number | null;
  /** The lowest price among the variants. */
  from: number;
  hasRange: boolean;
  currency: string;
  trackStock: boolean;
  lowStockAt: number;
  state: StockState;
  options: { name: string; values: string[] }[];
  variants: ShopVariant[];
  category: { name: string; slug: string } | null;
  seo: Record<string, unknown> | null;
  featured: boolean;
  updatedAt: Date;
}

type Row = Prisma.StoreProductGetPayload<{ include: { items: true; category: true } }>;

function shape(p: Row): ShopProduct {
  const variants = p.items.map((v) => ({ id: v.id, key: v.key, label: v.label, price: v.price ?? p.price, stock: v.stock, image: v.image, sku: v.sku ?? p.sku }));
  const prices = variants.map((v) => v.price);
  const from = prices.length ? Math.min(...prices) : p.price;
  const inStock = !p.trackStock || variants.some((v) => v.stock > 0);
  const best = p.trackStock ? Math.max(0, ...variants.map((v) => v.stock)) : 1;
  return {
    id: p.id, name: p.name, slug: p.slug, kind: p.kind, summary: p.summary, bodyHtml: p.bodyHtml, images: p.images, price: p.price, comparePrice: p.comparePrice, from,
    hasRange: prices.length > 1 && Math.max(...prices) > from, currency: p.currency, trackStock: p.trackStock, lowStockAt: p.lowStockAt,
    state: inStock ? stockState({ trackStock: p.trackStock, stock: best, lowStockAt: p.lowStockAt }) : 'out',
    options: Array.isArray(p.options) ? (p.options as { name: string; values: string[] }[]) : [],
    variants, category: p.category ? { name: p.category.name, slug: p.category.slug } : null, seo: (p.seo ?? null) as Record<string, unknown> | null, featured: p.featured, updatedAt: p.updatedAt,
  };
}

export type SortKey = 'featured' | 'new' | 'price_asc' | 'price_desc';

/** Published products for the shop page, with search, category, sort and paging. Read fresh so stock is current. */
export async function listShopProducts(opts: { category?: string; q?: string; sort?: SortKey; page?: number }) {
  const settings = await getSetting(storeSettings);
  const where = {
    status: 'PUBLISHED' as const,
    ...(opts.category ? { category: { slug: opts.category } } : {}),
    ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: 'insensitive' as const } }, { summary: { contains: opts.q, mode: 'insensitive' as const } }, { sku: { contains: opts.q, mode: 'insensitive' as const } }] } : {}),
    ...(settings.hideSoldOut ? { OR: [{ trackStock: false }, { items: { some: { active: true, stock: { gt: 0 } } } }] } : {}),
  };
  const sort = opts.sort ?? 'featured';
  const orderBy = sort === 'new' ? [{ publishedAt: 'desc' as const }] : sort === 'price_asc' ? [{ price: 'asc' as const }] : sort === 'price_desc' ? [{ price: 'desc' as const }] : [{ featured: 'desc' as const }, { order: 'asc' as const }, { name: 'asc' as const }];
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const db = getDb();
  const [total, rows] = await Promise.all([db.storeProduct.count({ where }), db.storeProduct.findMany({ where, orderBy, skip: (page - 1) * settings.perPage, take: settings.perPage, include: { items: { where: { active: true }, orderBy: { order: 'asc' } }, category: true } })]);
  return { products: rows.map(shape), total, page, pages: Math.max(1, Math.ceil(total / settings.perPage)), perPage: settings.perPage };
}

export async function getShopProduct(slug: string): Promise<ShopProduct | null> {
  const row = await getDb().storeProduct.findFirst({ where: { slug, status: 'PUBLISHED' }, include: { items: { where: { active: true }, orderBy: { order: 'asc' } }, category: true } });
  return row ? shape(row) : null;
}

export async function listShopCategories() {
  return getDb().storeCategory.findMany({ where: { products: { some: { status: 'PUBLISHED' } } }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
}
