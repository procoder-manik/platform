'use client';

import { useActionState } from 'react';
import { signInAction, type SignInState } from '../actions';

const initial: SignInState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 block min-h-11 w-full rounded-input border border-line bg-base px-3 text-ink"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block min-h-11 w-full rounded-input border border-line bg-base px-3 text-ink"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-input border border-danger px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-button bg-primary px-4 font-medium text-primary-ink disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
