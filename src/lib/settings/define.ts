import type { z } from 'zod';
import type { FieldDef } from '@/lib/admin/fields';
import type { Area } from '@/lib/auth/areas';

/**
 * A settings group is one record in the Setting table, merged over `defaults` at read time.
 * Groups are declared here and rendered by the generic settings screen (Phase 1).
 */
export interface SettingsGroup<T> {
  key: string;
  label: string;
  description: string;
  area: Area;
  /** Module that owns the group. Hidden in the admin when that module is off. */
  module: string;
  schema: z.ZodType<T>;
  defaults: T;
  fields: FieldDef[];
  /** Managed by a custom screen rather than the generic settings page. */
  customScreen?: string;
}

export function defineSettings<T>(group: SettingsGroup<T>): SettingsGroup<T> {
  return group;
}
