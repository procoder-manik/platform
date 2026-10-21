/** An error with an HTTP status and a message that is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'error',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Thrown when code asks for a module that is switched off. */
export class ModuleOffError extends HttpError {
  constructor(
    public readonly moduleId: string,
    context: 'public' | 'admin',
  ) {
    super(
      context === 'public' ? 404 : 409,
      context === 'public'
        ? 'Page not found.'
        : `The ${moduleId} module is switched off. Switch it on in Admin > Modules to use this.`,
      'module_off',
    );
    this.name = 'ModuleOffError';
  }
}
