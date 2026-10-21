import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './errors';

/**
 * Wraps a route handler so known errors become clear JSON answers and unknown ones are logged.
 * Guards (requireArea, requireModule) are called inside the handler, in that order, before any work.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          { ok: false, code: 'invalid', message: 'Some values are not valid.', issues: error.issues },
          { status: 422 },
        );
      }
      console.error('[route] Unexpected error', error);
      return NextResponse.json(
        { ok: false, code: 'server_error', message: 'Something went wrong on our side. Please try again.' },
        { status: 500 },
      );
    }
  };
}
