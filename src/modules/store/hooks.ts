import 'server-only';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http/errors';
import { getSetting } from '@/lib/settings/store';
import { renderRichText } from '@/lib/richtext/render';
import type { ResourceHooks } from '@/lib/admin/hooks';
import { cleanOptions, expandVariants } from '@/lib/store/logic';
import { storeSettings } from '@/lib/store/settings';
import { syncVariants } from '@/lib/store/engine';

const isLink = (v: string) => /^https:\/\//.test(v) || (v.startsWith('/') && !v.startsWith('//'));

export const storeHooks: Record<string, ResourceHooks> = {
  'shop-categories': {
    async beforeDelete(record) {
      const count = await getDb().storeProduct.count({ where: { categoryId: String(record.id) } });
      if (count > 0) throw new HttpError(422, `${count} product(s) are in this category. Move them first. Products without a category still show in the shop.`);
    },
  },
  products: {
    async beforeSave(values, { existing }) {
      const merged = { ...(existing ?? {}), ...values } as Record<string, unknown>;
      const settings = await getSetting(storeSettings);

      // Everything in the store is sold in one currency.
      values.currency = settings.currency;

      if ('body' in values) values.bodyHtml = values.body ? renderRichText(values.body).html : null;

      if ('taxClass' in values && !settings.taxClasses.some((c) => c.id === values.taxClass)) {
        throw new HttpError(422, `There is no tax class "${String(values.taxClass)}". Choose one of: ${settings.taxClasses.map((c) => c.id).join(', ')}. You can add classes in Settings > Store.`, 'taxClass');
      }

      if ('options' in values) {
        const options = cleanOptions(values.options);
        try {
          expandVariants(options);
        } catch (error) {
          throw new HttpError(422, error instanceof Error ? error.message : 'These options are not valid.', 'options');
        }
        values.options = options;
      }

      if ('digitalFiles' in values) {
        const files = Array.isArray(values.digitalFiles) ? (values.digitalFiles as { name?: string; url?: string }[]) : [];
        for (const f of files) if (!f.url || !isLink(f.url)) throw new HttpError(422, `The file "${f.name ?? ''}" needs a link that starts with https:// or a file from the media library.`, 'digitalFiles');
      }

      if (merged.kind === 'digital') {
        if ('weightGrams' in values || !existing) values.weightGrams = 0;
        if (merged.status === 'PUBLISHED' && (!Array.isArray(merged.digitalFiles) || (merged.digitalFiles as unknown[]).length === 0)) {
          throw new HttpError(422, 'A digital product needs at least one file before it can be published. Add one in the Digital tab.', 'digitalFiles');
        }
      }
      if (merged.status === 'PUBLISHED' && !(Number(merged.price) > 0)) throw new HttpError(422, 'A published product needs a price above zero.', 'price');
      if (merged.comparePrice !== null && merged.comparePrice !== undefined && Number(merged.comparePrice) > 0 && Number(merged.comparePrice) <= Number(merged.price ?? 0)) {
        throw new HttpError(422, 'The compare at price must be higher than the price, or empty.', 'comparePrice');
      }

      if (values.status === 'PUBLISHED' && !existing?.publishedAt) values.publishedAt = new Date();
      return values;
    },
    async afterSave(record) {
      record.variants = await syncVariants(String(record.id));
    },
  },
};
