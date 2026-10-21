import type { Area } from '@/lib/auth/areas';
import type { SettingsGroup } from '@/lib/settings/define';
import type { ResourceDef } from '@/lib/admin/resource';

/** An admin menu entry contributed by a module. */
export interface NavItem {
  group: 'Overview' | 'Content' | 'Shop' | 'Marketing' | 'AI' | 'SEO' | 'Inbox' | 'Settings';
  label: string;
  href: string;
  area: Area;
}

/**
 * Requirements in "all of these clauses, any option inside a clause" form.
 * [['services', 'store'], ['checkout']] reads: (services or store) and checkout.
 */
export type Requirements = readonly (readonly string[])[];

export interface ModuleManifest {
  id: string;
  label: string;
  description: string;
  requires: Requirements;
  defaultOn: boolean;
  /** Core cannot be switched off. */
  alwaysOn?: boolean;
  /** Development helpers that never switch on in production. */
  devOnly?: boolean;
  /** Public path patterns owned by this module. '/blog' matches /blog and /blog/...; '/checkout/*' matches only sub-paths. */
  routes: readonly string[];
  navigation: readonly NavItem[];
  settings: readonly SettingsGroup<unknown>[];
  resources?: readonly ResourceDef[];
  /** Filled from Phase 2 (blocks), Phase 4 (sitemap, schema) and later. */
  blocks?: readonly unknown[];
  sitemap?: () => Promise<{ url: string; lastModified?: Date }[]>;
  search?: (query: string) => Promise<{ title: string; url: string }[]>;
  cron?: readonly { path: string; schedule: string }[];
}

/** The serialisable part of a manifest, safe to pass to client components. */
export type ModuleMeta = Pick<
  ModuleManifest,
  'id' | 'label' | 'description' | 'requires' | 'defaultOn' | 'alwaysOn' | 'devOnly' | 'routes'
>;

export function defineModule<const M extends Partial<ModuleManifest> & Pick<ModuleManifest, 'id' | 'label' | 'description'>>(
  manifest: M,
): ModuleManifest {
  return {
    requires: [],
    defaultOn: false,
    routes: [],
    navigation: [],
    settings: [],
    ...manifest,
  };
}

export function toMeta(m: ModuleManifest): ModuleMeta {
  return {
    id: m.id,
    label: m.label,
    description: m.description,
    requires: m.requires,
    defaultOn: m.defaultOn,
    alwaysOn: m.alwaysOn,
    devOnly: m.devOnly,
    routes: m.routes,
  };
}
