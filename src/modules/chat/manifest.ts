import { defineModule } from '@/lib/modules/types';

export const manifest = defineModule({
  id: 'chat',
  label: 'Chat',
  description: 'A built-in chatbot with lead capture and handoff.',
  requires: [['knowledge']],
  defaultOn: true,
});
