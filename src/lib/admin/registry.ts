import { MODULES } from '@/modules/registry';
import type { ResourceDef } from './resource';

/** Every resource from every module, in registry order. */
export const RESOURCES: readonly ResourceDef[] = MODULES.flatMap((m) => m.resources ?? []);

export function getResource(id: string): ResourceDef | undefined {
  return RESOURCES.find((r) => r.id === id);
}
