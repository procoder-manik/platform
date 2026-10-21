import 'server-only';
import { isOn } from '@/lib/modules/server';
import { getCustomer } from './engine';

/** The id to put on a new order: the signed-in customer, or null for a guest or when accounts are off. */
export async function currentCustomerId(): Promise<string | null> {
  if (!(await isOn('accounts'))) return null;
  return (await getCustomer())?.id ?? null;
}
