import 'server-only';
import { redirect } from 'next/navigation';
import { getCustomer, type Customer } from './engine';

/** For account pages: sends visitors who are not signed in to the sign-in page, and brings them back afterwards. */
export async function requireCustomerPage(path: string): Promise<Customer> {
  const customer = await getCustomer();
  if (!customer) redirect(`/account/login?next=${encodeURIComponent(path)}`);
  return customer;
}
