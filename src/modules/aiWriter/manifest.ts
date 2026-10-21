import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'aiWriter',
  label: 'AI writer',
  description: 'An AI blog writer with free keyword research.',
  requires: [['blog']],
  defaultOn: false,
});
