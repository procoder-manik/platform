import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'newsletter',
  label: 'Newsletter',
  description: 'A signup block, subscriber list, CSV export and a provider webhook.',
  defaultOn: false,
});
