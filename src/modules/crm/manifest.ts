import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'crm',
  label: 'CRM',
  description: 'A contacts pipeline with notes and tasks.',
  requires: [['forms', 'accounts']],
  defaultOn: false,
});
