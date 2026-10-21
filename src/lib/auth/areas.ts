/**
 * Areas are the unit of permission. Every resource and settings group belongs to one area.
 * The API checks the area on every call; menus only hide what a role cannot use.
 */
export const AREAS = [
  'overview',
  'content',
  'blog',
  'media',
  'marketing',
  'seo',
  'design',
  'entries',
  'shop',
  'inbox',
  'ai',
  'settings',
  'modules',
  'users',
  'payments',
  'integrations',
  'apikeys',
  'code',
] as const;

export type Area = (typeof AREAS)[number];

export interface RoleDef {
  id: string;
  label: string;
  /** '*' means every area. */
  areas: readonly (Area | '*')[];
  builtIn: boolean;
}

export const BUILT_IN_ROLES: readonly RoleDef[] = [
  { id: 'administrator', label: 'Administrator', areas: ['*'], builtIn: true },
  {
    id: 'editor',
    label: 'Editor',
    areas: ['overview', 'blog', 'content', 'media', 'marketing', 'seo', 'design', 'entries'],
    builtIn: true,
  },
  { id: 'shop', label: 'Shop manager', areas: ['overview', 'shop', 'media', 'entries', 'inbox'], builtIn: true },
  { id: 'author', label: 'Author', areas: ['overview', 'blog', 'media'], builtIn: true },
];

export function isArea(value: string): value is Area {
  return (AREAS as readonly string[]).includes(value);
}

export function roleAllows(areas: readonly (Area | '*')[], area: Area): boolean {
  return areas.includes('*') || areas.includes(area);
}
