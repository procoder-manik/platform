import { defineModule } from '@/lib/modules/types';
import { testimonialsResource } from './resources';

export const manifest = defineModule({
  id: 'testimonials',
  label: 'Testimonials',
  description: 'A testimonials library and block.',
  defaultOn: true,
  resources: [testimonialsResource],
});
