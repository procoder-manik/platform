/**
 * Pure module logic: state resolution, dependency planning and route matching.
 * No database, no Next.js imports, so it runs in the proxy, on the server, in the browser and in tests.
 */
import type { ModuleMeta } from './types';

export type ModuleStates = Record<string, boolean>;

export interface ResolveOptions {
  production: boolean;
}

/** What the owner chose, merged over the manifest defaults. Unknown ids in the saved record are ignored. */
export function chosenStates(metas: readonly ModuleMeta[], saved: unknown, opts: ResolveOptions): ModuleStates {
  const savedRecord = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  const out: ModuleStates = {};
  for (const m of metas) {
    const value = savedRecord[m.id];
    let on = typeof value === 'boolean' ? value : m.defaultOn;
    if (m.alwaysOn) on = true;
    if (m.devOnly && opts.production) on = false;
    out[m.id] = on;
  }
  return out;
}

/**
 * What is actually live: a module counts as on only when it is chosen and every requirement clause
 * has at least one option that is itself live. Repeats until nothing changes.
 */
export function effectiveStates(metas: readonly ModuleMeta[], chosen: ModuleStates): ModuleStates {
  const out: ModuleStates = { ...chosen };
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of metas) {
      if (!out[m.id] || m.alwaysOn) continue;
      const satisfied = m.requires.every((clause) => clause.some((dep) => out[dep] === true));
      if (!satisfied) {
        out[m.id] = false;
        changed = true;
      }
    }
  }
  return out;
}

/** The requirement clauses of a module that are not met by the given states. */
export function unmetRequirements(meta: ModuleMeta, states: ModuleStates): (readonly string[])[] {
  return meta.requires.filter((clause) => !clause.some((dep) => states[dep] === true));
}

export interface TogglePlan {
  id: string;
  on: boolean;
  /** Modules that should also be switched on (when switching on) so requirements are met. */
  alsoOn: string[];
  /** Modules that depend on this one and stop working (when switching off). */
  alsoOff: string[];
}

/** Works out the side effects of switching one module, so the admin can offer them. */
export function planToggle(metas: readonly ModuleMeta[], chosen: ModuleStates, id: string, on: boolean): TogglePlan {
  const byId = new Map(metas.map((m) => [m.id, m]));
  const plan: TogglePlan = { id, on, alsoOn: [], alsoOff: [] };

  if (on) {
    const next: ModuleStates = { ...chosen, [id]: true };
    const queue = [id];
    while (queue.length > 0) {
      const current = byId.get(queue.shift() as string);
      if (!current) continue;
      for (const clause of unmetRequirements(current, next)) {
        const pick = clause.find((dep) => byId.has(dep) && !byId.get(dep)?.devOnly);
        if (!pick || next[pick]) continue;
        next[pick] = true;
        plan.alsoOn.push(pick);
        queue.push(pick);
      }
    }
    return plan;
  }

  const next: ModuleStates = { ...chosen, [id]: false };
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of metas) {
      if (!next[m.id] || m.alwaysOn) continue;
      if (unmetRequirements(m, next).length > 0) {
        next[m.id] = false;
        plan.alsoOff.push(m.id);
        changed = true;
      }
    }
  }
  return plan;
}

/** Applies a plan. With `cascade` the side effects are applied too; without it only the one module changes. */
export function applyPlan(chosen: ModuleStates, plan: TogglePlan, cascade: boolean): ModuleStates {
  const next: ModuleStates = { ...chosen, [plan.id]: plan.on };
  if (cascade) {
    for (const dep of plan.alsoOn) next[dep] = true;
    for (const dep of plan.alsoOff) next[dep] = false;
  }
  return next;
}

/** True when a route pattern covers the path. See ModuleManifest.routes for the pattern rules. */
export function routeMatches(pattern: string, path: string): boolean {
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return clean.startsWith(`${base}/`);
  }
  return clean === pattern || clean.startsWith(`${pattern}/`);
}

/** Every module that owns the path. All of them must be live for the path to be served. */
export function modulesForPath(metas: readonly ModuleMeta[], path: string): string[] {
  const ids: string[] = [];
  for (const m of metas) {
    if (m.routes.some((pattern) => routeMatches(pattern, path))) ids.push(m.id);
  }
  return ids;
}

/** Checks the registry for mistakes: duplicate ids, unknown requirements, self requirements. */
export function validateRegistry(metas: readonly ModuleMeta[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const m of metas) {
    if (ids.has(m.id)) problems.push(`Duplicate module id "${m.id}".`);
    ids.add(m.id);
  }
  for (const m of metas) {
    for (const clause of m.requires) {
      if (clause.length === 0) problems.push(`Module "${m.id}" has an empty requirement clause.`);
      for (const dep of clause) {
        if (dep === m.id) problems.push(`Module "${m.id}" requires itself.`);
        else if (!ids.has(dep)) problems.push(`Module "${m.id}" requires unknown module "${dep}".`);
      }
    }
  }
  return problems;
}
