import { describe, expect, it } from 'vitest';
import {
  applyPlan,
  chosenStates,
  effectiveStates,
  modulesForPath,
  planToggle,
  routeMatches,
  validateRegistry,
} from '@/lib/modules/logic';
import type { ModuleMeta } from '@/lib/modules/types';

const m = (id: string, extra: Partial<ModuleMeta> = {}): ModuleMeta => ({
  id,
  label: id,
  description: '',
  requires: [],
  defaultOn: false,
  routes: [],
  ...extra,
});

const metas: ModuleMeta[] = [
  m('core', { alwaysOn: true, defaultOn: true }),
  m('services', { defaultOn: true, routes: ['/pricing', '/checkout/*'] }),
  m('store', { requires: [['checkout']], routes: ['/shop', '/cart'] }),
  m('checkout', { defaultOn: true, routes: ['/checkout', '/order'] }),
  m('subscriptions', { requires: [['services', 'store'], ['checkout']] }),
  m('demo', { devOnly: true, defaultOn: true, routes: ['/demo'] }),
];

describe('chosenStates', () => {
  it('uses defaults, then saved values, and ignores unknown ids', () => {
    const states = chosenStates(metas, { store: true, ghost: true, services: 'yes' }, { production: false });
    expect(states).toEqual({ core: true, services: true, store: true, checkout: true, subscriptions: false, demo: true });
  });

  it('keeps core on and development modules off in production', () => {
    const states = chosenStates(metas, { core: false, demo: true }, { production: true });
    expect(states.core).toBe(true);
    expect(states.demo).toBe(false);
  });
});

describe('effectiveStates', () => {
  it('turns off a module whose requirement is off', () => {
    const live = effectiveStates(metas, { core: true, services: false, store: true, checkout: false, subscriptions: true });
    expect(live.store).toBe(false);
    expect(live.subscriptions).toBe(false);
  });

  it('accepts any option inside a requirement clause', () => {
    const live = effectiveStates(metas, { core: true, services: false, store: true, checkout: true, subscriptions: true });
    expect(live.subscriptions).toBe(true);
  });
});

describe('planToggle', () => {
  it('offers to switch on what a module needs', () => {
    const chosen = { core: true, services: false, store: false, checkout: false, subscriptions: false };
    const plan = planToggle(metas, chosen, 'subscriptions', true);
    expect(plan.alsoOn.sort()).toEqual(['checkout', 'services']);
  });

  it('offers to switch off modules that depend on the one going off', () => {
    const chosen = { core: true, services: true, store: true, checkout: true, subscriptions: true };
    const plan = planToggle(metas, chosen, 'checkout', false);
    expect(plan.alsoOff.sort()).toEqual(['store', 'subscriptions']);
  });

  it('does not list a dependent that still has another option', () => {
    const chosen = { core: true, services: true, store: true, checkout: true, subscriptions: true };
    expect(planToggle(metas, chosen, 'services', false).alsoOff).toEqual([]);
  });

  it('applies side effects only with cascade', () => {
    const chosen = { core: true, services: true, store: true, checkout: true, subscriptions: true };
    const plan = planToggle(metas, chosen, 'checkout', false);
    expect(applyPlan(chosen, plan, false)).toMatchObject({ checkout: false, store: true });
    expect(applyPlan(chosen, plan, true)).toMatchObject({ checkout: false, store: false, subscriptions: false });
  });
});

describe('route matching', () => {
  it('matches a prefix and its sub-paths only', () => {
    expect(routeMatches('/blog', '/blog')).toBe(true);
    expect(routeMatches('/blog', '/blog/')).toBe(true);
    expect(routeMatches('/blog', '/blog/hello')).toBe(true);
    expect(routeMatches('/blog', '/blogger')).toBe(false);
  });

  it('matches only sub-paths for a /* pattern', () => {
    expect(routeMatches('/checkout/*', '/checkout')).toBe(false);
    expect(routeMatches('/checkout/*', '/checkout/web-design')).toBe(true);
  });

  it('lists every module that owns a path', () => {
    expect(modulesForPath(metas, '/checkout/web-design').sort()).toEqual(['checkout', 'services']);
    expect(modulesForPath(metas, '/checkout')).toEqual(['checkout']);
    expect(modulesForPath(metas, '/about')).toEqual([]);
  });
});

describe('validateRegistry', () => {
  it('reports duplicate ids and unknown requirements', () => {
    const problems = validateRegistry([m('a'), m('a'), m('b', { requires: [['nope']] })]);
    expect(problems).toHaveLength(2);
  });
});
