import { defineModule } from '@/lib/modules/types';
import { subscriptionSettings } from '@/lib/subscriptions/settings';
import { subscriptionsResource } from './resources';

export const manifest = defineModule({
  id: 'subscriptions',
  label: 'Subscriptions',
  description: 'Monthly or yearly plans with start and end dates, reminders, expiry and renewals.',
  requires: [['services', 'store'], ['checkout']],
  defaultOn: false,
  routes: ['/subscription'],
  resources: [subscriptionsResource],
  settings: [subscriptionSettings],
  cron: [{ path: '/api/cron/subscriptions', schedule: '0 6 * * *' }],
});
