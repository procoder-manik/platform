import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http/errors';
import { auth } from './config';
import { BUILT_IN_ROLES, roleAllows, type Area } from './areas';

export interface StaffUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  areas: readonly (Area | '*')[];
}

async function areasForRole(roleId: string | null): Promise<readonly (Area | '*')[]> {
  if (!roleId) return [];
  const builtIn = BUILT_IN_ROLES.find((r) => r.id === roleId);
  if (builtIn) return builtIn.areas;
  const custom = await getDb().role.findUnique({ where: { id: roleId } });
  return (custom?.areas ?? []) as Area[];
}

/** The signed-in staff member, or null. Checked against the Session row on every request. */
export const getStaff = cache(async (): Promise<StaffUser | null> => {
  const session = await auth();
  const sid = session?.sid;
  if (!sid) return null;
  const row = await getDb().session.findUnique({ where: { sessionToken: sid }, include: { user: true } });
  if (!row || row.expires < new Date() || row.user.blocked || row.user.kind !== 'STAFF') return null;
  const role = row.user.role ?? '';
  return { id: row.user.id, email: row.user.email, name: row.user.name, role, areas: await areasForRole(role) };
});

export function staffCan(staff: StaffUser, area: Area): boolean {
  return roleAllows(staff.areas, area);
}

/** For admin pages: sends visitors to the sign-in page. */
export async function requireStaffPage(): Promise<StaffUser> {
  const staff = await getStaff();
  if (!staff) redirect('/admin/login');
  return staff;
}

/** For admin pages that belong to an area: 404 when the role cannot use it. */
export async function requireAreaPage(area: Area): Promise<StaffUser> {
  const staff = await requireStaffPage();
  if (!staffCan(staff, area)) notFound();
  return staff;
}

/** For route handlers and server actions: throws 401 or 403. The menu only hides; this enforces. */
export async function requireArea(area: Area): Promise<StaffUser> {
  const staff = await getStaff();
  if (!staff) throw new HttpError(401, 'Please sign in again.', 'unauthenticated');
  if (!staffCan(staff, area)) throw new HttpError(403, 'Your role does not have access to this.', 'forbidden');
  return staff;
}
