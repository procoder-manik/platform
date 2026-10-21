import 'server-only';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http/errors';
import type { ResourceHooks } from '@/lib/admin/hooks';

export const serviceHooks: Record<string, ResourceHooks> = {
  services: {
    async beforeDelete(record) {
      const count = await getDb().package.count({ where: { serviceId: String(record.id) } });
      if (count > 0) throw new HttpError(422, `This service has ${count} package(s). Delete or move them first. To hide it without deleting, switch off "Show on the site".`);
    },
  },
  packages: {
    async beforeSave(values, { existing }) {
      const merged = { ...existing, ...values } as Record<string, unknown>;
      const price = Number(merged.price ?? 0);
      if (merged.mode === 'buy' && !(price > 0)) throw new HttpError(422, 'A package that can be bought needs a price above zero. Use "Request a quote" if the price is agreed case by case.', 'price');
      if (merged.priceMax !== null && merged.priceMax !== undefined && Number(merged.priceMax) > 0 && Number(merged.priceMax) <= price) throw new HttpError(422, 'The top of the range must be higher than the price.', 'priceMax');
      if (merged.billing !== 'MONTHLY') {
        values.monthlyYearly = false;
        values.yearlyDiscountPct = 0;
        values.yearlyPrice = null;
      }
      if (values.serviceId) {
        const service = await getDb().service.findUnique({ where: { id: String(values.serviceId) } });
        if (!service) throw new HttpError(422, 'Choose the service this package belongs to.', 'serviceId');
      }
      return values;
    },
  },
};
