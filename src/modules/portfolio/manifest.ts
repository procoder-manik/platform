import { defineModule } from '@/lib/modules/types';
import { projectsResource } from './resources';
import { portfolioSettings } from './settings';

export const manifest = defineModule({
  id: 'portfolio',
  label: 'Portfolio',
  description: 'Projects with hover-scroll screenshots, a portfolio archive and blocks.',
  defaultOn: true,
  routes: ['/portfolio'],
  resources: [projectsResource],
  settings: [portfolioSettings],
});
