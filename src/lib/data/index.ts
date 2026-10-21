import 'server-only';

/**
 * All public reads go through lib/data: cached with tags, with a fallback when the database is down.
 * Phase 0 only has settings and module states; content readers arrive with their modules.
 */
export { getSetting } from '@/lib/settings/store';
export { isOn, getModuleStates } from '@/lib/modules/server';
