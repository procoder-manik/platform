import { describe, expect, it } from 'vitest';
import { cleanEmail, isEmail, MIN_PASSWORD, passwordProblem } from '@/lib/accounts/logic';
import { customersResource } from '@/modules/accounts/resources';
import { manifest } from '@/modules/accounts/manifest';
import { routeMatches } from '@/lib/modules/logic';
import { walkFields } from '@/lib/admin/fields';
import { EMAIL_TEMPLATES, unknownPlaceholders } from '@/lib/mail/templates';

describe('passwordProblem', () => {
  it('accepts a decent password', () => {
    expect(passwordProblem('correct horse battery', 'a@b.test')).toBeNull();
    expect(passwordProblem('x'.repeat(MIN_PASSWORD - 1) + 'y', 'a@b.test')).toBeNull();
  });
  it('explains what is wrong', () => {
    expect(passwordProblem('short1', 'a@b.test')).toMatch(/at least 10/);
    expect(passwordProblem('x'.repeat(201))).toMatch(/200/);
    expect(passwordProblem('aaaaaaaaaaaa')).toMatch(/one character/);
    expect(passwordProblem('Password123')).toMatch(/too common/);
    expect(passwordProblem('1234567890')).toMatch(/too common/);
    expect(passwordProblem('sam.jones@example.test', 'sam.jones@example.test')).toMatch(/email/);
    expect(passwordProblem('my-samjones-pass', 'samjones@example.test')).toMatch(/email/);
    expect(passwordProblem('joe-is-fine-here', 'joe@example.test')).toBeNull();
  });
});

describe('email tidying', () => {
  it('lower-cases and trims, and checks the shape', () => {
    expect(cleanEmail('  Sam@Example.TEST ')).toBe('sam@example.test');
    expect(cleanEmail(null)).toBe('');
    expect(isEmail('a@b.test')).toBe(true);
    for (const bad of ['', 'a', 'a@b', 'a b@c.test', `${'x'.repeat(250)}@b.test`]) expect(isEmail(bad), bad).toBe(false);
  });
});

describe('accounts wiring', () => {
  it('owns /account only', () => {
    expect(manifest.routes.some((r) => routeMatches(r, '/account/orders'))).toBe(true);
    expect(manifest.routes.some((r) => routeMatches(r, '/accounting'))).toBe(false);
  });
  it('lets staff change only safe fields of a customer', () => {
    const editable = customersResource.fields.filter((f) => !f.readOnly).map((f) => f.name).sort();
    expect(editable).toEqual(['blocked', 'name', 'phone']);
    expect(customersResource.baseWhere).toEqual({ kind: 'CUSTOMER' });
    for (const { field, path } of walkFields(customersResource.fields)) expect(field.info.length, path).toBeGreaterThan(10);
  });
  it('has an email for every account step, using only known placeholders', () => {
    for (const id of ['account.verify', 'account.reset', 'account.magic', 'account.exists', 'account.changed'] as const) {
      const t = EMAIL_TEMPLATES[id];
      expect(unknownPlaceholders(`${t.subject} ${t.body}`), id).toEqual([]);
    }
  });
});
