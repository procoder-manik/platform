import { z } from 'zod';
import { MODULES } from '@/modules/registry';
import { defineSettings, type SettingsGroup } from './define';

/**
 * Owner choices for module switches, managed on the Modules screen.
 * Defaults stay empty: manifest defaults are applied in chosenStates(), so a module added in a later
 * release starts with its own default on every client site.
 */
export const modulesSettings = defineSettings<Record<string, boolean>>({
  key: 'modules',
  label: 'Modules',
  description: 'Which feature groups are switched on.',
  area: 'modules',
  module: 'core',
  schema: z.record(z.string(), z.boolean()),
  defaults: {},
  fields: [],
  customScreen: '/admin/modules',
});

/** Every settings group: core groups first, then each module's groups in registry order. */
export const SETTINGS_GROUPS: readonly SettingsGroup<unknown>[] = [
  modulesSettings as SettingsGroup<unknown>,
  ...MODULES.flatMap((m) => m.settings),
];

export function getSettingsGroup(key: string): SettingsGroup<unknown> | undefined {
  return SETTINGS_GROUPS.find((g) => g.key === key);
}
