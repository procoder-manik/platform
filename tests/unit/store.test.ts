import { describe, expect, it } from 'vitest';
import {
  addToCart, checkAddress, cleanOptions, computeStoreTotals, expandVariants, parseCart, ratesFor, serializeCart, setQuantity, shippingCost, stockState, taxRateFor, variantKey, withRateIds,
  type ShippingRateDef,
} from '@/lib/store/logic';
import { storeSettings } from '@/lib/store/settings';
import { productsResource, storeCategoriesResource } from '@/modules/store/resources';
import { manifest } from '@/modules/store/manifest';
import { routeMatches } from '@/lib/modules/logic';
import { walkFields } from '@/lib/admin/fields';

const VID = 'a1b2c3d4-0000-4000-8000-000000000001';
const VID2 = 'a1b2c3d4-0000-4000-8000-000000000002';

describe('options and variants', () => {
  it('cleans options: trims, drops empties and repeats, keeps at most three', () => {
    const out = cleanOptions([{ name: ' Size ', values: ['S', ' M ', 'S', ''] }, { name: 'size', values: ['x'] }, { name: '', values: ['a'] }, { name: 'Colour', values: [] }, { name: 'Fit', values: ['Slim'] }, { name: 'A', values: ['1'] }, { name: 'B', values: ['1'] }]);
    expect(out).toEqual([{ name: 'Size', values: ['S', 'M'] }, { name: 'Fit', values: ['Slim'] }, { name: 'A', values: ['1'] }]);
    expect(cleanOptions('nonsense')).toEqual([]);
  });
  it('makes one default variant when there are no options', () => {
    expect(expandVariants([])).toEqual([{ key: '', label: 'Default', values: {} }]);
  });
  it('makes every combination with a stable key', () => {
    const options = [{ name: 'Size', values: ['S', 'M'] }, { name: 'Color', values: ['Red', 'Blue'] }];
    const v = expandVariants(options);
    expect(v.map((x) => x.key)).toEqual(['Size=S|Color=Red', 'Size=S|Color=Blue', 'Size=M|Color=Red', 'Size=M|Color=Blue']);
    expect(v[1]?.label).toBe('S / Blue');
    expect(variantKey(options, { Size: 'M', Color: 'Red' })).toBe('Size=M|Color=Red');
  });
  it('refuses too many variants with a plain message', () => {
    const values = Array.from({ length: 11 }, (_, i) => `v${i}`);
    expect(() => expandVariants([{ name: 'A', values }, { name: 'B', values }])).toThrow(/121 variants/);
  });
});

describe('tax', () => {
  const classes = [{ id: 'standard', name: 'Standard', ratePct: 5 }, { id: 'reduced', name: 'Reduced', ratePct: 0 }];
  const overrides = [{ classId: 'standard', country: 'DE', ratePct: 19 }, { classId: 'standard', country: '', ratePct: 7 }];
  it('picks the country rate, then the class rate for everyone, then the class default', () => {
    expect(taxRateFor(classes, overrides, 'standard', 'de')).toBe(19);
    expect(taxRateFor(classes, overrides, 'standard', 'FR')).toBe(7);
    expect(taxRateFor(classes, [], 'standard', 'FR')).toBe(5);
    expect(taxRateFor(classes, overrides, 'reduced', 'DE')).toBe(0);
    expect(taxRateFor(classes, overrides, 'unknown', 'DE')).toBe(0);
  });
  it('adds tax per line and on shipping when prices exclude it', () => {
    const t = computeStoreTotals({ lines: [{ amount: 10_000, ratePct: 10 }, { amount: 5000, ratePct: 0 }], shipping: 1000, shippingRatePct: 10, inclusive: false });
    expect(t).toMatchObject({ subtotal: 15_000, tax: 1100, total: 17_100, lineTax: [1000, 0], shippingTax: 100 });
  });
  it('takes tax out of the prices when they include it', () => {
    const t = computeStoreTotals({ lines: [{ amount: 11_000, ratePct: 10 }], shipping: 1100, shippingRatePct: 10, inclusive: true });
    expect(t.lineTax).toEqual([1000]);
    expect(t).toMatchObject({ tax: 1100, total: 12_100, subtotal: 11_000 });
  });
  it('charges nothing extra at zero rate and never goes negative', () => {
    expect(computeStoreTotals({ lines: [{ amount: 500, ratePct: 0 }], shipping: 0, shippingRatePct: 0, inclusive: false })).toMatchObject({ tax: 0, total: 500 });
    expect(computeStoreTotals({ lines: [], shipping: 0, shippingRatePct: 20, inclusive: false })).toMatchObject({ total: 0 });
  });
});

describe('shipping', () => {
  const defs: ShippingRateDef[] = [
    { zone: 'Bangladesh', countries: ['BD'], name: 'Standard', kind: 'flat', price: 500, perKg: 0, freeOver: 10_000 },
    { zone: 'Bangladesh', countries: ['BD'], name: 'Express', kind: 'per_item', price: 300, perKg: 0, freeOver: null },
    { zone: 'World', countries: ['*'], name: 'Courier', kind: 'weight', price: 1000, perKg: 400, freeOver: null },
    { zone: 'Gift', countries: ['US'], name: 'Free', kind: 'free', price: 0, perKg: 0, freeOver: null },
  ];
  const rates = withRateIds(defs);
  it('gives stable ids and keeps duplicates apart', () => {
    expect(rates.map((r) => r.id)).toEqual(['bangladesh:standard', 'bangladesh:express', 'world:courier', 'gift:free']);
    expect(withRateIds([defs[0] as ShippingRateDef, defs[0] as ShippingRateDef]).map((r) => r.id)).toEqual(['bangladesh:standard', 'bangladesh:standard-2']);
  });
  it('uses the zone that names the country, else the rest of the world', () => {
    expect(ratesFor(rates, 'bd').map((r) => r.name)).toEqual(['Standard', 'Express']);
    expect(ratesFor(rates, 'FR').map((r) => r.name)).toEqual(['Courier']);
    expect(ratesFor(rates, 'US').map((r) => r.name)).toEqual(['Free']);
    expect(ratesFor(rates, '')).toEqual([]);
    expect(ratesFor(rates.filter((r) => r.countries[0] !== '*'), 'FR')).toEqual([]);
  });
  it('prices each kind', () => {
    const basket = { subtotal: 4000, weightGrams: 2500, units: 3 };
    expect(shippingCost(rates[0] as never, basket)).toBe(500);
    expect(shippingCost(rates[1] as never, basket)).toBe(900);
    expect(shippingCost(rates[2] as never, basket)).toBe(2000);
    expect(shippingCost(rates[3] as never, basket)).toBe(0);
  });
  it('is free over the threshold, exactly at it', () => {
    expect(shippingCost(rates[0] as never, { subtotal: 9999, weightGrams: 0, units: 1 })).toBe(500);
    expect(shippingCost(rates[0] as never, { subtotal: 10_000, weightGrams: 0, units: 1 })).toBe(0);
  });
});

describe('cart cookie', () => {
  it('reads a clean cart and merges repeats', () => {
    expect(parseCart(serializeCart([{ v: VID, q: 2 }, { v: VID2, q: 1 }]))).toEqual([{ v: VID, q: 2 }, { v: VID2, q: 1 }]);
    expect(parseCart(JSON.stringify([{ v: VID, q: 2 }, { v: VID, q: 3 }]))).toEqual([{ v: VID, q: 5 }]);
  });
  it('ignores anything that is not a clean cart', () => {
    for (const raw of [undefined, '', 'not json', '{}', '[1,2]', JSON.stringify([{ v: 'x', q: 1 }, { v: VID, q: 0 }, { v: VID, q: 1.5 }, { v: '../etc', q: 1 }, { v: VID, q: -3 }])]) expect(parseCart(raw as string)).toEqual([]);
  });
  it('caps quantity and the number of lines', () => {
    expect(parseCart(JSON.stringify([{ v: VID, q: 5000 }]))).toEqual([{ v: VID, q: 99 }]);
    const many = Array.from({ length: 80 }, (_, i) => ({ v: `variant-${String(i).padStart(4, '0')}`, q: 1 }));
    expect(parseCart(JSON.stringify(many))).toHaveLength(40);
  });
  it('adds, sets and removes', () => {
    let c = addToCart([], VID, 2);
    c = addToCart(c, VID, 200);
    expect(c).toEqual([{ v: VID, q: 99 }]);
    c = addToCart(c, VID2, 1);
    c = setQuantity(c, VID, 4);
    expect(c).toEqual([{ v: VID, q: 4 }, { v: VID2, q: 1 }]);
    expect(setQuantity(c, VID2, 0)).toEqual([{ v: VID, q: 4 }]);
  });
});

describe('addresses', () => {
  const good = { name: 'Sam', line1: '1 High St', city: 'Dhaka', country: 'bd', phone: '+880 1700 000000' };
  it('accepts a complete address and tidies it', () => {
    const r = checkAddress({ ...good, line2: '  ', postal: ' 1212 ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.address).toMatchObject({ country: 'BD', postal: '1212', line2: '' });
  });
  it('explains what is missing', () => {
    const r = checkAddress({ name: '', line1: '', city: '', country: 'ZZ', phone: '12' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['city', 'country', 'line1', 'name', 'phone']);
    expect(checkAddress(null).ok).toBe(false);
  });
});

describe('stock wording', () => {
  it('tells in, low and out apart', () => {
    expect(stockState({ trackStock: false, stock: 0, lowStockAt: 5 })).toBe('in');
    expect(stockState({ trackStock: true, stock: 0, lowStockAt: 0 })).toBe('out');
    expect(stockState({ trackStock: true, stock: 5, lowStockAt: 5 })).toBe('low');
    expect(stockState({ trackStock: true, stock: 6, lowStockAt: 5 })).toBe('in');
    expect(stockState({ trackStock: true, stock: 1, lowStockAt: 0 })).toBe('in');
  });
});

describe('store settings and wiring', () => {
  const ok = { ...storeSettings.defaults };
  it('accepts the defaults and a full shipping setup', () => {
    expect(storeSettings.schema.safeParse(ok).success).toBe(true);
    expect(storeSettings.schema.safeParse({ ...ok, shippingRates: [{ zone: 'BD', countries: ['BD'], name: 'Standard', kind: 'flat', price: 500, perKg: null, freeOver: null }] }).success).toBe(true);
    expect(storeSettings.schema.safeParse({ ...ok, shippingRates: [{ zone: 'Free', countries: ['*'], name: 'Free', kind: 'free', price: null, perKg: null, freeOver: null }] }).success).toBe(true);
  });
  it('refuses unusable values', () => {
    for (const patch of [{ taxClasses: [] }, { perPage: 1 }, { holdHours: 0 }, { taxOverrides: [{ classId: 'standard', country: 'Germany', ratePct: 19 }] }, { shippingRates: [{ zone: 'x', countries: [], name: 'x', kind: 'flat', price: 1, perKg: null, freeOver: null }] }, { shippingRates: [{ zone: 'x', countries: ['BD'], name: 'x', kind: 'teleport', price: 1, perKg: null, freeOver: null }] }]) {
      expect(storeSettings.schema.safeParse({ ...ok, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });
  it('declares a field for every setting', () => {
    expect(storeSettings.fields.map((f) => f.name).sort()).toEqual(Object.keys(storeSettings.defaults).sort());
  });
  it('owns the shop, cart and download addresses', () => {
    for (const p of ['/shop', '/shop/a-product', '/cart', '/cart/checkout', '/download/x/y/0']) expect(manifest.routes.some((r) => routeMatches(r, p)), p).toBe(true);
    expect(manifest.routes.some((r) => routeMatches(r, '/shopping'))).toBe(false);
    expect(manifest.cron?.[0]?.path).toBe('/api/cron/store');
  });
  it('every product and category field has help text and a real column', () => {
    for (const def of [productsResource, storeCategoriesResource]) for (const { field, path } of walkFields(def.fields)) expect(field.info.length, `${def.id}.${path}`).toBeGreaterThan(10);
    const columns = new Set(['name', 'status', 'kind', 'price', 'featured', 'order', 'updatedAt', 'slug', 'currency', 'sku', 'taxClass', 'weightGrams']);
    for (const c of productsResource.columns) expect(columns.has(c.field), c.field).toBe(true);
  });
});
