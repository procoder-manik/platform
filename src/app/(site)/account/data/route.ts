import { NextResponse } from 'next/server';
import { exportCustomerData, getCustomer } from '@/lib/accounts/engine';
import { requireModule } from '@/lib/modules/server';

export const dynamic = 'force-dynamic';

/** Everything held about the signed-in customer, as a JSON download. */
export async function GET() {
  try {
    await requireModule('accounts');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const customer = await getCustomer();
  if (!customer) return new NextResponse('Please sign in first.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const data = await exportCustomerData(customer);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="my-data.json"', 'Cache-Control': 'no-store' } });
}
