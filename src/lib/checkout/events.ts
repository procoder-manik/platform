import 'server-only';
import type { Order, OrderItem, Payment } from '@/generated/prisma/client';

export type PaidOrder = Order & { items: OrderItem[]; payments: Payment[] };
type Handler = (order: PaidOrder) => Promise<void>;

const handlers: { name: string; run: Handler }[] = [];
const refundHandlers: { name: string; run: Handler }[] = [];
const cancelHandlers: { name: string; run: Handler }[] = [];

/**
 * Later modules react to a paid order: subscriptions start and renew (Phase 6), stock is deducted (Phase 7),
 * referral and affiliate rewards land (Phase 8). Each handler runs once per paid order and a failing
 * handler never undoes the payment: it is logged and the others still run.
 */
export function onOrderPaid(name: string, run: Handler): void {
  if (!handlers.some((h) => h.name === name)) handlers.push({ name, run });
}

export async function runPaidHandlers(order: PaidOrder): Promise<void> {
  for (const h of handlers) {
    try {
      await h.run(order);
    } catch (error) {
      console.error(`[orders] paid handler "${h.name}" failed for ${order.number}`, error);
    }
  }
}

/**
 * Modules that need to know when an order is refunded in full (subscriptions end, rewards are taken back).
 * Same rules as paid handlers: each runs once per refund, and one failing never stops the others.
 */
export function onOrderRefunded(name: string, run: Handler): void {
  if (!refundHandlers.some((h) => h.name === name)) refundHandlers.push({ name, run });
}

export async function runRefundHandlers(order: PaidOrder): Promise<void> {
  for (const h of refundHandlers) {
    try {
      await h.run(order);
    } catch (error) {
      console.error(`[orders] refund handler \"${h.name}\" failed for ${order.number}`, error);
    }
  }
}

/** Modules that must give something back when an order is cancelled (the store returns reserved stock). */
export function onOrderCancelled(name: string, run: Handler): void {
  if (!cancelHandlers.some((h) => h.name === name)) cancelHandlers.push({ name, run });
}

export async function runCancelHandlers(order: PaidOrder): Promise<void> {
  for (const h of cancelHandlers) {
    try {
      await h.run(order);
    } catch (error) {
      console.error(`[orders] cancel handler \"${h.name}\" failed for ${order.number}`, error);
    }
  }
}
