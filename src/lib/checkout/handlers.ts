import 'server-only';
import { onOrderCancelled, onOrderPaid, onOrderRefunded } from './events';

/**
 * Registers the order-paid and order-refunded handlers of the modules that are installed. Each later phase adds
 * one line here (referral and affiliate rewards). Modules are loaded on first use so this file
 * never forms an import cycle with the order engine.
 */
onOrderPaid('subscriptions', async (order) => (await import('@/lib/subscriptions/engine')).handlePaidOrder(order));
onOrderRefunded('subscriptions', async (order) => (await import('@/lib/subscriptions/engine')).handleRefundedOrder(order));
onOrderPaid('store', async (order) => (await import('@/lib/store/engine')).handlePaidStoreOrder(order));
onOrderCancelled('store', async (order) => {
  await (await import('@/lib/store/engine')).releaseOrderStock(order.id);
});
onOrderPaid('growth', async (order) => (await import('@/lib/growth/engine')).handlePaidGrowth(order));
onOrderRefunded('growth', async (order) => (await import('@/lib/growth/engine')).handleRefundedGrowth(order));
onOrderCancelled('growth', async (order) => {
  await (await import('@/lib/growth/engine')).releaseDiscount(order.id);
});
