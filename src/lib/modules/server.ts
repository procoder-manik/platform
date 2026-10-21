import 'server-only';
import { MODULES } from '@/modules/registry';
import { getSetting, saveSetting } from '@/lib/settings/store';
import { modulesSettings } from '@/lib/settings/registry';
import { ModuleOffError } from '@/lib/http/errors';
import { chosenStates, effectiveStates, type ModuleStates } from './logic';
import { toMeta } from './types';

export const MODULE_METAS = MODULES.map(toMeta);

const isProduction = () => process.env.NODE_ENV === 'production';

/** The owner's choices (what the switches show). */
export async function getChosenModuleStates(): Promise<ModuleStates> {
  const saved = await getSetting(modulesSettings);
  return chosenStates(MODULE_METAS, saved, { production: isProduction() });
}

/** What is live, after requirements are applied. Use isOn() in feature code. */
export async function getModuleStates(): Promise<ModuleStates> {
  return effectiveStates(MODULE_METAS, await getChosenModuleStates());
}

/** The only way feature code asks whether a module is on. Cached through the `settings` tag. */
export async function isOn(id: string): Promise<boolean> {
  const states = await getModuleStates();
  return states[id] === true;
}

/** First line of every route handler and server action that belongs to a module. */
export async function requireModule(id: string, context: 'public' | 'admin' = 'public'): Promise<void> {
  if (!(await isOn(id))) throw new ModuleOffError(id, context);
}

/** Saves the owner's choices. Only known, switchable module ids are stored. */
export async function saveModuleChoices(next: ModuleStates): Promise<void> {
  const clean: ModuleStates = {};
  for (const m of MODULE_METAS) {
    if (m.alwaysOn || (m.devOnly && isProduction())) continue;
    const value = next[m.id];
    if (typeof value === 'boolean') clean[m.id] = value;
  }
  await saveSetting(modulesSettings, clean);
}
