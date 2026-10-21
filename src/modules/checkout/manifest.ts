import { defineModule } from '@/lib/modules/types';
import { ordersResource } from './resources';
import { paymentSettings } from '@/lib/checkout/settings';

export const manifest = defineModule({
  id: 'checkout',
  label: 'Checkout',
  description: 'Checkout, orders, invoices and payment methods. Used by Services and Store.',
  defaultOn: true,
  routes: ['/checkout', '/order', '/invoice'],
  resources: [ordersResource],
  settings: [paymentSettings],
});
