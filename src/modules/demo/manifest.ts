import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'demo',
  label: 'Demo (development only)',
  description: 'A dummy module used to test switching. Never on in production.',
  defaultOn: true,
  devOnly: true,
  routes: ['/demo'],
});
