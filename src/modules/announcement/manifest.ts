import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'announcement',
  label: 'Announcement bar',
  description: 'An announcement bar with an optional countdown.',
  defaultOn: false,
});
