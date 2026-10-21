import { defineModule } from '@/lib/modules/types';
import { storeSettings } from '@/lib/store/settings';
import { productsResource, storeCategoriesResource } from './resources';

export const manifest = defineModule({
  id: 'store',
  label: 'Store',
  description: 'Physical and digital products, options and variants, stock, cart, shipping and tax.',
  requires: [['checkout']],
  defaultOn: false,
  routes: ['/shop', '/cart', '/download'],
  resources: [productsResource, storeCategoriesResource],
  settings: [storeSettings],
  navigation: [{ group: 'Shop', label: 'Inventory', href: '/admin/inventory', area: 'shop' }],
  cron: [{ path: '/api/cron/store', schedule: '30 5 * * *' }],
});
