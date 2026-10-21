import 'server-only';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http/errors';
import { hashPassword } from '@/lib/auth/password';
import { BUILT_IN_ROLES } from '@/lib/auth/areas';
import type { ResourceHooks } from '@/lib/admin/hooks';
import { PAGE_TEMPLATES } from '@/lib/blocks/templates';
import { newBlockId, type Block } from '@/lib/blocks/types';

const freshIds = (blocks: Block[]): Block[] => blocks.map((b) => ({ ...b, id: newBlockId(), children: b.children ? freshIds(b.children) : undefined }));

export const coreHooks: Record<string, ResourceHooks> = {
  pages: {
    async beforeSave(values, { isNew }) {
      const reserved = ['admin', 'api', 'blog', 'portfolio', 'case-studies', 'apps', 'resume', 'shop', 'cart', 'checkout', 'order', 'invoice', 'subscription', 'download', 'a', 'ref', 'affiliate', 'affiliates', 'account', 'pricing', 'faq', 'help', 'preview', 'maintenance', 'demo', 'feed', 'sitemap', 'robots', 'module-unavailable'];
      if (typeof values.slug === 'string' && reserved.includes(values.slug)) throw new HttpError(422, `"${values.slug}" is used by the site itself. Choose another address.`, 'slug');
      if (values.status !== undefined && values.status !== 'SCHEDULED') values.publishAt = null;
      // A new page without sections starts from its chosen layout.
      const template = typeof values.template === 'string' ? PAGE_TEMPLATES[values.template] : undefined;
      if (isNew && template && (!Array.isArray(values.blocks) || values.blocks.length === 0)) values.blocks = freshIds(template.blocks());
      return values;
    },
    async afterSave(record) {
      if (record.isHome === true) {
        await getDb().page.updateMany({ where: { isHome: true, id: { not: String(record.id) } }, data: { isHome: false } });
      }
    },
  },

  redirects: {
    async beforeSave(values, { existing }) {
      const merged = { ...existing, ...values };
      if (merged.code === 410) values.to = '';
      if (merged.match === 'regex') {
        try {
          new RegExp(String(merged.from));
        } catch {
          throw new HttpError(422, 'The "From" pattern is not a valid regular expression.', 'from');
        }
      }
      if (merged.match === 'exact' && merged.from === merged.to) {
        throw new HttpError(422, 'A redirect cannot point to itself.', 'to');
      }
      // No chains: if the target is itself redirected, point straight at the final address.
      if (typeof merged.to === 'string' && merged.to.startsWith('/') && merged.code !== 410) {
        const seen = new Set([String(merged.from)]);
        let target = merged.to;
        for (let i = 0; i < 10; i += 1) {
          const next = await getDb().redirect.findFirst({ where: { from: target, active: true, match: 'exact', NOT: { id: String(existing?.id ?? '') } } });
          if (!next || next.code === 410) break;
          if (seen.has(next.to)) throw new HttpError(422, `This would make a loop: ${target} already redirects back to ${next.to}.`, 'to');
          seen.add(target);
          target = next.to;
        }
        values.to = target;
      }
      return values;
    },
  },

  users: {
    async beforeSave(values, { staff, existing, isNew }) {
      if (typeof values.password === 'string' && values.password) {
        values.passwordHash = await hashPassword(values.password);
      }
      delete values.password;
      if (isNew) {
        values.kind = 'STAFF';
        values.emailVerified = new Date();
      }
      if (existing?.id === staff.id) {
        if (values.blocked === true) throw new HttpError(422, 'You cannot block yourself.', 'blocked');
        if (values.role !== undefined && values.role !== existing.role && existing.role === 'administrator') {
          throw new HttpError(422, 'You cannot remove your own administrator role. Ask another administrator.', 'role');
        }
      }
      if (typeof values.email === 'string') {
        const clash = await getDb().user.findUnique({ where: { email: values.email } });
        if (clash && clash.id !== existing?.id) throw new HttpError(422, 'Another account already uses this email.', 'email');
      }
      return values;
    },
    async afterSave(record, { existing }) {
      const passwordChanged = existing && record.passwordHash !== existing.passwordHash;
      if (record.blocked === true || passwordChanged) {
        await getDb().session.deleteMany({ where: { userId: String(record.id) } });
      }
    },
    async beforeDelete(record, { staff }) {
      if (record.id === staff.id) throw new HttpError(422, 'You cannot delete your own account.');
      if (record.role === 'administrator') {
        const admins = await getDb().user.count({ where: { kind: 'STAFF', role: 'administrator', blocked: false } });
        if (admins <= 1) throw new HttpError(422, 'This is the last administrator. Make someone else an administrator first.');
      }
    },
  },

  'global-sections': {
    async beforeDelete(record) {
      const used = await getDb().$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM "Page" WHERE "blocks"::text LIKE $1 AND "deletedAt" IS NULL`,
        `%${String(record.id)}%`,
      );
      const count = Number(used[0]?.count ?? 0);
      if (count > 0) throw new HttpError(422, `${count} page(s) use this section. Remove it from them first.`);
    },
  },

  roles: {
    async beforeSave(values, { existing }) {
      if (typeof values.id === 'string' && BUILT_IN_ROLES.some((r) => r.id === values.id)) {
        throw new HttpError(422, 'That id belongs to a built-in role. Choose another.', 'id');
      }
      if (existing && values.id !== undefined && values.id !== existing.id) {
        const used = await getDb().user.count({ where: { role: String(existing.id) } });
        if (used > 0) throw new HttpError(422, `${used} user(s) have this role, so its id cannot change.`, 'id');
      }
      return values;
    },
    async beforeDelete(record) {
      const used = await getDb().user.count({ where: { role: String(record.id) } });
      if (used > 0) throw new HttpError(422, `${used} user(s) have this role. Give them another role first.`);
    },
  },
};
