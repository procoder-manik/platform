import { defineResource } from '@/lib/admin/resource';
import { SUB_PERIOD_LABEL, SUB_STATUS_LABEL, SUB_PERIODS, type SubStatusId } from '@/lib/subscriptions/schedule';

const statusOptions = (Object.keys(SUB_STATUS_LABEL) as SubStatusId[]).map((s) => ({ value: s, label: SUB_STATUS_LABEL[s] }));

/** The subscription list. One subscription is opened in a dedicated screen (Subscriptions, one plan), not the generic editor. */
export const subscriptionsResource = defineResource({
  id: 'subscriptions',
  label: 'Subscription',
  labelPlural: 'Subscriptions',
  description: 'Every recurring plan with its status and end date. Open one to extend it, send a renewal invoice, stop it or add a note.',
  module: 'subscriptions',
  area: 'shop',
  model: 'subscription',
  entity: 'subscription',
  nav: { group: 'Shop' },
  titleField: 'number',
  readOnly: true,
  creatable: false,
  addHref: '/admin/subscriptions/new',
  deletable: false,
  duplicate: false,
  fields: [
    { name: 'number', label: 'Subscription', type: 'text', readOnly: true, info: 'The subscription number.' },
    { name: 'email', label: 'Email', type: 'text', readOnly: true, info: 'The customer’s email.' },
    { name: 'title', label: 'Plan', type: 'text', readOnly: true, info: 'The plan as sold.' },
    { name: 'status', label: 'Status', type: 'text', readOnly: true, info: 'Where the plan stands.' },
    { name: 'amount', label: 'Price per term', type: 'money', readOnly: true, info: 'The price of one term before tax.' },
  ],
  columns: [
    { field: 'number', label: 'Subscription', kind: 'title', sortable: true },
    { field: 'email', label: 'Customer', kind: 'text', sortable: true },
    { field: 'title', label: 'Plan', kind: 'text', sortable: true },
    { field: 'status', label: 'Status', kind: 'subscriptionStatus', sortable: true },
    { field: 'currentPeriodEnd', label: 'Ends', kind: 'date', sortable: true },
    { field: 'amount', label: 'Per term', kind: 'money', sortable: true },
    { field: 'period', label: 'Billed', kind: 'text', hiddenByDefault: true },
    { field: 'renewals', label: 'Renewals', kind: 'number', sortable: true, hiddenByDefault: true },
    { field: 'startedAt', label: 'Started', kind: 'date', sortable: true, hiddenByDefault: true },
  ],
  searchFields: ['number', 'email', 'title'],
  filters: [
    { field: 'status', label: 'Status', options: statusOptions },
    { field: 'period', label: 'Billed', options: SUB_PERIODS.map((p) => ({ value: p, label: SUB_PERIOD_LABEL[p] })) },
    { field: 'cancelAtPeriodEnd', label: 'Renewing', type: 'boolean', options: [{ value: 'false', label: 'Renewing' }, { value: 'true', label: 'Set not to renew' }] },
  ],
  defaultSort: { field: 'currentPeriodEnd', dir: 'asc' },
  csv: { columns: ['number', 'email', 'title', 'status', 'period', 'currency', 'amount', 'startedAt', 'currentPeriodEnd', 'cancelAtPeriodEnd', 'renewals'] },
});
