'use server';

import { z } from 'zod';
import { requireArea } from '@/lib/auth/guards';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { adjustStock } from './engine';

type Result = { ok: true; message: string; stock: number } | { ok: false; message: string };

/** Staff: add or remove stock for one variant, with a note that stays in its history. */
export async function adjustStockAction(variantId: string, delta: number, note: string): Promise<Result> {
  try {
    const staff = await requireArea('shop');
    await requireModule('store', 'admin');
    const stock = await adjustStock(z.string().min(1).max(100).parse(variantId), z.number().int().parse(delta), z.string().max(200).parse(note).trim(), { id: staff.id, name: staff.name || staff.email });
    return { ok: true, message: `Stock is now ${stock}.`, stock };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: 'Enter a whole number of items.' };
    console.error('[store] stock adjustment failed', error);
    return { ok: false, message: 'Something went wrong on our side and nothing was changed. Try again.' };
  }
}
