/** True for plain JSON-like objects (not arrays, dates or class instances). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Merges saved values over defaults.
 * Objects merge key by key, arrays and primitives from `saved` replace the default,
 * and `undefined` in `saved` keeps the default. New default keys therefore appear
 * automatically after an update, and nothing the owner saved is lost.
 */
export function mergeOverDefaults<T>(defaults: T, saved: unknown): T {
  if (saved === undefined || saved === null) return defaults;
  if (isPlainObject(defaults)) {
    if (!isPlainObject(saved)) return defaults;
    const out: Record<string, unknown> = { ...defaults };
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) continue;
      out[key] = key in defaults ? mergeOverDefaults(defaults[key], value) : value;
    }
    return out as T;
  }
  return saved as T;
}
