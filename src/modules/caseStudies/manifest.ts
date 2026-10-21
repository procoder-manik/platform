import { defineModule } from '@/lib/modules/types';
import { caseStudiesResource } from './resources';

export const manifest = defineModule({
  id: 'caseStudies',
  label: 'Case studies',
  description: 'Long-form client stories with an archive and blocks.',
  defaultOn: false,
  routes: ['/case-studies'],
  resources: [caseStudiesResource],
});
