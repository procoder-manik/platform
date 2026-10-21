import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'aiNews',
  label: 'AI news',
  description: 'News feeds as ideas for blog posts.',
  requires: [['aiWriter']],
  defaultOn: false,
});
