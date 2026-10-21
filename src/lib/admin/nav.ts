import { MODULES } from '@/modules/registry';
import { SETTINGS_GROUPS } from '@/lib/settings/registry';
import { roleAllows, type Area } from '@/lib/auth/areas';
import type { NavItem } from '@/lib/modules/types';
import type { ModuleStates } from '@/lib/modules/logic';

export const NAV_GROUP_ORDER: readonly NavItem['group'][] = ['Overview', 'Content', 'Shop', 'Marketing', 'AI', 'SEO', 'Inbox', 'Settings'];

export interface NavGroup {
  name: NavItem['group'];
  items: NavItem[];
}

/**
 * Admin menu, built from the registries: module menu items, resources and settings groups.
 * Only live modules appear, and only items the role's areas allow. The server still checks every request.
 */
export function buildAdminNav(states: ModuleStates, areas: readonly (Area | '*')[]): NavGroup[] {
  const live = MODULES.filter((m) => states[m.id] === true);
  const liveIds = new Set(live.map((m) => m.id));
  const items: NavItem[] = [
    ...live.flatMap((m) => m.navigation),
    ...live.flatMap((m) =>
      (m.resources ?? []).filter((r) => r.nav).map((r) => ({ group: r.nav!.group, label: r.nav!.label ?? r.labelPlural, href: `/admin/${r.id}`, area: r.area })),
    ),
    ...SETTINGS_GROUPS.filter((g) => !g.customScreen && liveIds.has(g.module)).map((g) => ({
      group: 'Settings' as const,
      label: g.label,
      href: `/admin/settings/${g.key}`,
      area: g.area,
    })),
  ].filter((item) => roleAllows(areas, item.area));

  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(i.href) ? false : (seen.add(i.href), true)));
  return NAV_GROUP_ORDER.map((name) => ({ name, items: unique.filter((i) => i.group === name) })).filter((g) => g.items.length > 0);
}
