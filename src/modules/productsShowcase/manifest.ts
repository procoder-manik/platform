import { defineModule } from '@/lib/modules/types';
import { appsResource } from './resources';
import { appsSettings } from './settings';

export const manifest = defineModule({
  id: 'productsShowcase',
  label: 'Products showcase',
  description: 'Your own apps or SaaS products on /apps, with a footer list.',
  defaultOn: false,
  routes: ['/apps'],
  resources: [appsResource],
  settings: [appsSettings],
});
