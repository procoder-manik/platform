import { defineResource } from '@/lib/admin/resource';
import { ORDER_STATUSES, STATUS_LABEL } from '@/lib/checkout/status';

const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }));

/** The order list. Orders are opened in a dedicated screen (Orders, one order), not the generic editor. */
export const ordersResource = defineResource({
  id: 'orders',
  label: 'Order',
  labelPlural: 'Orders',
  description: 'Every order with its payment status. Open one to work it: change status, verify payments, add updates, refund.',
  module: 'checkout',
  area: 'shop',
  model: 'order',
  entity: 'order',
  nav: { group: 'Shop' },
  titleField: 'number',
  readOnly: true,
  creatable: false,
  deletable: false,
  duplicate: false,
  fields: [
    { name: 'number', label: 'Order', type: 'text', readOnly: true, info: 'The order number.' },
    { name: 'email', label: 'Email', type: 'text', readOnly: true, info: 'The buyer’s email.' },
    { name: 'status', label: 'Status', type: 'text', readOnly: true, info: 'Where the order stands.' },
    { name: 'total', label: 'Total', type: 'money', readOnly: true, info: 'The amount charged.' },
  ],
  columns: [
    { field: 'number', label: 'Order', kind: 'title', sortable: true },
    { field: 'email', label: 'Customer', kind: 'text', sortable: true },
    { field: 'status', label: 'Status', kind: 'orderStatus', sortable: true },
    { field: 'total', label: 'Total', kind: 'money', sortable: true },
    { field: 'methodId', label: 'Method', kind: 'text' },
    { field: 'invoiceNumber', label: 'Invoice', kind: 'code', hiddenByDefault: true },
    { field: 'createdAt', label: 'Placed', kind: 'date', sortable: true },
  ],
  searchFields: ['number', 'email', 'invoiceNumber'],
  filters: [{ field: 'status', label: 'Status', options: statusOptions }, { field: 'methodId', label: 'Method', options: ['stripe', 'paypal', 'sslcommerz', 'bkash', 'nagad', 'rocket', 'bank', 'wise', 'payoneer'].map((m) => ({ value: m, label: m })) }],
  defaultSort: { field: 'createdAt', dir: 'desc' },
  csv: { columns: ['number', 'email', 'status', 'currency', 'subtotal', 'discount', 'shipping', 'tax', 'total', 'methodId', 'invoiceNumber', 'paidAt', 'createdAt'] },
});
