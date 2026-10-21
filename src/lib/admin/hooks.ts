import 'server-only';
import type { StaffUser } from '@/lib/auth/guards';
import { coreHooks } from '@/modules/core/hooks';
import { contentHooks } from '@/modules/blog/hooks';
import { serviceHooks } from '@/modules/services/hooks';
import { storeHooks } from '@/modules/store/hooks';
import { growthHooks } from '@/modules/growth/hooks';

export interface HookContext {
  staff: StaffUser;
  isNew: boolean;
  existing: Record<string, unknown> | null;
}

/** Server-only behaviour for a resource. Throw HttpError with a plain message to stop the save or delete. */
export interface ResourceHooks {
  /** Receives validated values keyed by field path; returns the column values to write. */
  beforeSave?(values: Record<string, unknown>, ctx: HookContext): Promise<Record<string, unknown>>;
  afterSave?(record: Record<string, unknown>, ctx: HookContext): Promise<void>;
  beforeDelete?(record: Record<string, unknown>, ctx: HookContext): Promise<void>;
}

const HOOKS: Record<string, ResourceHooks> = { ...coreHooks, ...contentHooks, ...serviceHooks, ...storeHooks, ...growthHooks };

export function hooksFor(resourceId: string): ResourceHooks {
  return HOOKS[resourceId] ?? {};
}
