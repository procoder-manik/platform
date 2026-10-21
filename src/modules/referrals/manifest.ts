import { defineModule } from '@/lib/modules/types';
import { referralSettings } from '@/lib/growth/settings';
import { referralsResource } from './resources';

export const manifest = defineModule({
  id: 'referrals',
  label: 'Referrals',
  description: 'Customer share links with rewards for both sides.',
  requires: [['checkout']],
  defaultOn: false,
  routes: ['/ref'],
  resources: [referralsResource],
  settings: [referralSettings],
});
