import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'knowledge',
  label: 'Knowledge base',
  description: 'Taught answers that feed the FAQ page, the Help center and the chatbot.',
  defaultOn: true,
  routes: ['/faq', '/help'],
});
