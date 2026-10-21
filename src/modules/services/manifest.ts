import { defineModule } from '@/lib/modules/types';
import { packagesResource, servicesResource } from './resources';
import { servicesSettings } from './settings';

export const manifest = defineModule({
  id: 'services',
  label: 'Services',
  description: 'Services and packages, a pricing page and quote requests. Buy buttons need the Checkout module.',
  defaultOn: true,
  routes: ['/pricing', '/checkout/*'],
  resources: [servicesResource, packagesResource],
  settings: [servicesSettings],
});
