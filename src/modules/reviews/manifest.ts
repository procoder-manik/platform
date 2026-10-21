import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'reviews',
  label: 'Reviews',
  description: 'Product and service reviews with moderation and rating schema.',
  requires: [['store', 'services']],
  defaultOn: false,
});
