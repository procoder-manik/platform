import 'server-only';
import { requireArea, type StaffUser } from '@/lib/auth/guards';
import { requireModule } from '@/lib/modules/server';
import { HttpError } from '@/lib/http/errors';
import { getResource } from './registry';
import type { ResourceDef } from './resource';

/** Every admin write: authentication, then the role's area, then the module. In that order. */
export async function guardResource(resourceId: string): Promise<{ def: ResourceDef; staff: StaffUser }> {
  const def = getResource(resourceId);
  if (!def) throw new HttpError(404, 'This list does not exist.');
  const staff = await requireArea(def.area);
  await requireModule(def.module, 'admin');
  return { def, staff };
}

/** Converts known errors into a plain message for the admin UI. */
export function failure(error: unknown): { ok: false; message: string; errors: Record<string, string> } {
  if (error instanceof HttpError) return { ok: false, message: error.message, errors: {} };
  console.error('[admin] action failed', error);
  return { ok: false, message: 'Something went wrong on our side and nothing was saved. Try again.', errors: {} };
}
