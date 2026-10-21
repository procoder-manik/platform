import { defineModule } from '@/lib/modules/types';
import { maintenanceSettings } from './settings';

export const manifest = defineModule({
  id: 'maintenance',
  label: 'Maintenance mode',
  description: 'Shows a maintenance page to visitors. The admin keeps working.',
  defaultOn: false,
  settings: [maintenanceSettings],
});
