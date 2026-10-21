/** Raised when a feature needs a provider that has not been set up. The message tells the owner what to do. */
export class AdapterNotConfiguredError extends Error {
  constructor(kind: string, hint: string) {
    super(`No ${kind} provider is set up. ${hint}`);
    this.name = 'AdapterNotConfiguredError';
  }
}
