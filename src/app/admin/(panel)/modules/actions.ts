'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { requireArea } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { refresh } from '@/lib/cache/refresh';
import { TAGS } from '@/lib/cache/tags';
import { HttpError } from '@/lib/http/errors';
import { applyPlan, effectiveStates, planToggle, type ModuleStates } from '@/lib/modules/logic';
import { getChosenModuleStates, MODULE_METAS, saveModuleChoices } from '@/lib/modules/server';

const input = z.object({ id: z.string().min(1).max(64), on: z.boolean(), cascade: z.boolean() });

export type ToggleResult =
  | { ok: true; chosen: ModuleStates; effective: ModuleStates }
  | { ok: false; message: string };

/** Switches one module, optionally with the modules it needs or the ones that need it. */
export async function toggleModule(raw: unknown): Promise<ToggleResult> {
  try {
    const staff = await requireArea('modules');
    const { id, on, cascade } = input.parse(raw);
    const meta = MODULE_METAS.find((m) => m.id === id);
    if (!meta) return { ok: false, message: 'That module does not exist.' };
    if (meta.alwaysOn) return { ok: false, message: `${meta.label} is always on.` };
    if (meta.devOnly && process.env.NODE_ENV === 'production') {
      return { ok: false, message: `${meta.label} is only available in development.` };
    }

    const before = await getChosenModuleStates();
    const plan = planToggle(MODULE_METAS, before, id, on);
    const chosen = applyPlan(before, plan, cascade);
    await saveModuleChoices(chosen);

    const changed = Object.keys(chosen).filter((k) => chosen[k] !== before[k]);
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    await writeAudit({
      userId: staff.id,
      action: 'modules.toggle',
      entity: 'setting',
      entityId: 'modules',
      diff: Object.fromEntries(changed.map((k) => [k, { from: before[k] ?? null, to: chosen[k] ?? null }])),
      ip,
    });
    refresh([TAGS.settings, TAGS.content]);
    return { ok: true, chosen, effective: effectiveStates(MODULE_METAS, chosen) };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message };
    console.error('[modules] toggle failed', error);
    return { ok: false, message: 'The change was not saved. Check the database connection and try again.' };
  }
}
