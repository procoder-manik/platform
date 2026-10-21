import { defineModule } from '@/lib/modules/types';
import { customersResource } from './resources';

export const manifest = defineModule({
  id: 'accounts',
  label: 'Customer accounts',
  description: 'Customer sign-up, a private portal, order history, saved addresses and a wishlist.',
  defaultOn: true,
  routes: ['/account'],
  resources: [customersResource],
});
