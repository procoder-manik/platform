import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';

export interface PublicPackage {
  id: string; name: string; slug: string; tagline: string | null; price: number; priceMax: number | null; currency: string;
  billing: 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'HOURLY'; monthlyYearly: boolean; yearlyDiscountPct: number; yearlyPrice: number | null;
  mode: string; deliveryDays: number | null; features: string[]; popular: boolean;
}
export interface PublicService {
  id: string; name: string; slug: string; summary: string | null; icon: string | null; packages: PublicPackage[];
}

/** Active services with their active packages, for the pricing page and blocks. Cached with tags. */
export async function listServices(serviceId?: string): Promise<PublicService[]> {
  try {
    return await unstable_cache(
      async () => {
        const rows = await getDb().service.findMany({
          where: { active: true, ...(serviceId ? { id: serviceId } : {}) },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
          include: { packages: { where: { active: true }, orderBy: [{ order: 'asc' }, { price: 'asc' }] } },
        });
        return rows.filter((s) => s.packages.length > 0).map((s) => ({ id: s.id, name: s.name, slug: s.slug, summary: s.summary, icon: s.icon, packages: s.packages.map(({ id, name, slug, tagline, price, priceMax, currency, billing, monthlyYearly, yearlyDiscountPct, yearlyPrice, mode, deliveryDays, features, popular }) => ({ id, name, slug, tagline, price, priceMax, currency, billing, monthlyYearly, yearlyDiscountPct, yearlyPrice, mode, deliveryDays, features, popular })) }));
      },
      ['services', serviceId ?? 'all'],
      { tags: [TAGS.content, TAGS.type('service'), TAGS.type('package')], revalidate: 3600 },
    )();
  } catch (error) {
    console.error('[data] services read failed, using fallback', error);
    return [];
  }
}

/** One buyable package with its service, read fresh: checkout must never use a cached price. */
export async function getBuyablePackage(slug: string) {
  return getDb().package.findFirst({ where: { slug, active: true, service: { active: true } }, include: { service: true } });
}
