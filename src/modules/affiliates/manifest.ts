import { defineModule } from '@/lib/modules/types';
import { affiliateSettings } from '@/lib/growth/settings';
import { affiliatesResource } from './resources';

export const manifest = defineModule({
  id: 'affiliates',
  label: 'Affiliates',
  description: 'Affiliate applications, tracking links, commissions and payouts.',
  requires: [['checkout']],
  defaultOn: false,
  routes: ['/a', '/affiliate', '/affiliates'],
  resources: [affiliatesResource],
  settings: [affiliateSettings],
  navigation: [{ group: 'Marketing', label: 'Payouts', href: '/admin/payouts', area: 'marketing' }],
  cron: [{ path: '/api/cron/growth', schedule: '15 5 * * *' }],
});
