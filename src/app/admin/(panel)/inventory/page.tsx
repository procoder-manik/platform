import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';
import { InventoryTable } from './inventory-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function InventoryPage({ searchParams }: Props) {
  await requireAreaPage('shop');
  if (!(await isOn('store'))) notFound();
  const q = await searchParams;
  const search = (q.q ?? '').trim().slice(0, 80);
  const db = getDb();
  const variants = await db.productVariant.findMany({
    where: { active: true, product: { trackStock: true, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } : {}) }, ...(q.view === 'low' ? { stock: { lte: 5 } } : {}) },
    include: { product: { select: { id: true, name: true, slug: true, lowStockAt: true, status: true } } },
    orderBy: [{ stock: 'asc' }, { productId: 'asc' }, { order: 'asc' }],
    take: 200,
  });
  const moves = await db.stockMovement.findMany({ where: { variantId: { in: variants.map((v) => v.id) } }, orderBy: { createdAt: 'desc' }, take: 1500 });
  const site = await getSetting(siteSettings);
  const rows = variants.map((v) => ({
    id: v.id, productId: v.product.id, product: v.product.name, label: v.key ? v.label : '', sku: v.sku ?? '', stock: v.stock, lowAt: v.product.lowStockAt, status: v.product.status,
    moves: moves.filter((m) => m.variantId === v.id).slice(0, 6).map((m) => ({ id: m.id, delta: m.delta, balance: m.balance, reason: m.reason, note: m.note, at: m.createdAt.toISOString() })),
  }));
  return <InventoryTable rows={rows} search={search} view={q.view === 'low' ? 'low' : 'all'} timeZone={site.timeZone} />;
}
