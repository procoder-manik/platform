import { defineModule } from '@/lib/modules/types';
import { resumeSettings } from './settings';

export const manifest = defineModule({
  id: 'resume',
  label: 'Resume',
  description: 'A printable resume page with experience, education, skills and certifications.',
  defaultOn: false,
  routes: ['/resume'],
  settings: [resumeSettings],
});
