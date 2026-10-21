import { describe, expect, it } from 'vitest';
import { mergeOverDefaults } from '@/lib/utils/merge';

describe('mergeOverDefaults', () => {
  const defaults = { name: 'Your company', colours: { primary: 'blue', accent: 'gold' }, tags: ['a'] };

  it('returns defaults when nothing is saved', () => {
    expect(mergeOverDefaults(defaults, null)).toEqual(defaults);
    expect(mergeOverDefaults(defaults, undefined)).toEqual(defaults);
  });

  it('keeps new default keys that were added after the owner saved', () => {
    expect(mergeOverDefaults(defaults, { colours: { primary: 'red' } })).toEqual({
      name: 'Your company',
      colours: { primary: 'red', accent: 'gold' },
      tags: ['a'],
    });
  });

  it('replaces arrays instead of merging them', () => {
    expect(mergeOverDefaults(defaults, { tags: ['b', 'c'] }).tags).toEqual(['b', 'c']);
  });

  it('ignores a saved value of the wrong shape for an object default', () => {
    expect(mergeOverDefaults(defaults, { colours: 'oops' }).colours).toEqual(defaults.colours);
  });

  it('does not change the defaults object', () => {
    mergeOverDefaults(defaults, { name: 'Changed' });
    expect(defaults.name).toBe('Your company');
  });
});
