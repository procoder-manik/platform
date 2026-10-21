import { defineModule } from '@/lib/modules/types';
import { couponsResource, couponUsesResource } from './resources';

export const manifest = defineModule({
  id: 'coupons',
  label: 'Coupons',
  description: 'Discount codes at checkout.',
  requires: [['checkout']],
  defaultOn: false,
  resources: [couponsResource, couponUsesResource],
});
