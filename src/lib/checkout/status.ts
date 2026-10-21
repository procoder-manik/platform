/** Order statuses, who may move where, and the plain labels. Pure, so it is unit tested. */
export const ORDER_STATUSES = ['PENDING_PAYMENT', 'VERIFYING', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'FAILED'] as const;
export type OrderStatusId = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatusId, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  VERIFYING: 'Checking payment',
  PAID: 'Paid',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  FAILED: 'Payment failed',
};

export const TRANSITIONS: Record<OrderStatusId, readonly OrderStatusId[]> = {
  PENDING_PAYMENT: ['VERIFYING', 'PAID', 'CANCELLED', 'FAILED'],
  VERIFYING: ['PAID', 'FAILED', 'CANCELLED', 'PENDING_PAYMENT'],
  FAILED: ['PENDING_PAYMENT', 'PAID', 'CANCELLED'],
  PAID: ['IN_PROGRESS', 'COMPLETED', 'SHIPPED', 'CANCELLED', 'REFUNDED'],
  IN_PROGRESS: ['COMPLETED', 'SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'COMPLETED', 'REFUNDED'],
  DELIVERED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export const canMove = (from: OrderStatusId, to: OrderStatusId) => TRANSITIONS[from].includes(to);

/** States in which the customer can still pay. */
export const PAYABLE: readonly OrderStatusId[] = ['PENDING_PAYMENT', 'FAILED'];
/** States that count as money received. */
export const PAID_STATES: readonly OrderStatusId[] = ['PAID', 'IN_PROGRESS', 'COMPLETED', 'SHIPPED', 'DELIVERED'];

export const STATUS_TONE: Record<OrderStatusId, 'success' | 'warning' | 'danger' | 'muted'> = {
  PENDING_PAYMENT: 'warning', VERIFYING: 'warning', PAID: 'success', IN_PROGRESS: 'success', COMPLETED: 'success', SHIPPED: 'success', DELIVERED: 'success', CANCELLED: 'muted', REFUNDED: 'muted', FAILED: 'danger',
};

export const isStatus = (v: string): v is OrderStatusId => (ORDER_STATUSES as readonly string[]).includes(v);
